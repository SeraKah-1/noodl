/**
 * Neuro-Sync — SM-2 spaced repetition
 * Local IndexedDB is primary. Supabase syncs when signed in.
 */
import { SRSItem } from "../types";
import { auth, supabase, isSupabaseConfigured } from "../supabase";
import { get, set } from "idb-keyval";

import { KEYS } from "./storageKeys";

const SRS_IDB_KEY = KEYS.srsIdb;

async function loadLocal(): Promise<SRSItem[]> {
  return (await get(SRS_IDB_KEY)) || [];
}

async function saveLocal(items: SRSItem[]) {
  await set(SRS_IDB_KEY, items);
}

function cloudOn() {
  return Boolean(isSupabaseConfigured && supabase && auth.currentUser);
}

export const NeuroSync = {
  calculateNextReview(item: SRSItem, rating: number): SRSItem {
    let { easiness, interval, repetition } = item;

    const q = rating === 0 ? 0 : rating === 1 ? 3 : rating === 2 ? 4 : 5;
    easiness = easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easiness < 1.3) easiness = 1.3;

    let nextIntervalMinutes = 0;

    if (rating === 0) {
      repetition = 0;
      interval = 0;
      nextIntervalMinutes = 1;
    } else if (rating === 1) {
      if (repetition === 0) {
        nextIntervalMinutes = 10;
      } else {
        interval = Math.max(1, Math.round(interval * 1.2));
        nextIntervalMinutes = interval * 24 * 60;
      }
    } else if (rating === 2) {
      if (repetition === 0) interval = 1;
      else if (repetition === 1) interval = 3;
      else interval = Math.round(interval * easiness);
      repetition++;
      nextIntervalMinutes = interval * 24 * 60;
    } else if (rating === 3) {
      if (repetition === 0) interval = 4;
      else interval = Math.round(interval * easiness * 1.3);
      repetition++;
      nextIntervalMinutes = interval * 24 * 60;
    }

    if (nextIntervalMinutes > 60) {
      const fuzzRange = nextIntervalMinutes * 0.05;
      nextIntervalMinutes += Math.random() * fuzzRange * 2 - fuzzRange;
    }

    const nextReview = new Date();
    nextReview.setMinutes(nextReview.getMinutes() + nextIntervalMinutes);

    return {
      ...item,
      easiness,
      interval,
      repetition,
      next_review: nextReview.toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  async addItem(_config: any, keycardId: string, item: Partial<SRSItem>) {
    const items = await loadLocal();
    if (items.some((i) => i.item_id === item.item_id)) return true;

    const id = item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newItem: SRSItem = {
      keycard_id: keycardId || "global",
      item_id: item.item_id!,
      item_type: item.item_type || "quiz_question",
      content: item.content,
      easiness: 2.5,
      interval: 0,
      repetition: 0,
      next_review: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...item,
      id,
    };

    items.push(newItem);
    await saveLocal(items);

    if (cloudOn() && supabase && auth.currentUser) {
      const { error } = await supabase.from("srs_items").upsert({
        id: newItem.id,
        user_id: auth.currentUser.uid,
        keycard_id: newItem.keycard_id,
        item_id: newItem.item_id,
        item_type: newItem.item_type,
        content: newItem.content,
        easiness: newItem.easiness,
        interval: newItem.interval,
        repetition: newItem.repetition,
        next_review: newItem.next_review,
        updated_at: new Date().toISOString(),
      });
      if (error) console.warn("[SRS cloud add]", error.message);
    }
    return true;
  },

  async getDueItems(_config: any, keycardId: string): Promise<SRSItem[]> {
    // Prefer local; pull cloud if signed in
    if (cloudOn() && supabase && auth.currentUser) {
      try {
        let q = supabase
          .from("srs_items")
          .select("*")
          .eq("user_id", auth.currentUser.uid)
          .lte("next_review", new Date().toISOString())
          .order("next_review", { ascending: true });
        if (keycardId && keycardId !== "global") {
          q = q.eq("keycard_id", keycardId);
        }
        const { data, error } = await q;
        if (!error && data) {
          return data.map((row: any) => ({
            ...row,
            next_review:
              typeof row.next_review === "string"
                ? row.next_review
                : new Date(row.next_review).toISOString(),
          }));
        }
      } catch (e) {
        console.warn("[SRS cloud due]", e);
      }
    }

    const now = Date.now();
    const items = await loadLocal();
    return items
      .filter((i) => {
        if (keycardId && keycardId !== "global" && i.keycard_id !== keycardId) return false;
        return new Date(i.next_review).getTime() <= now;
      })
      .sort((a, b) => +new Date(a.next_review) - +new Date(b.next_review));
  },

  async getStats(_config: any, keycardId: string) {
    const items = await loadLocal();
    const filtered =
      keycardId && keycardId !== "global"
        ? items.filter((i) => i.keycard_id === keycardId)
        : items;
    const now = Date.now();
    const due = filtered.filter((i) => +new Date(i.next_review) <= now).length;
    const learned = filtered.filter((i) => (i.repetition || 0) >= 2).length;
    return { total: filtered.length, due, learned };
  },

  async updateItem(item: SRSItem, rating: number) {
    const updated = this.calculateNextReview(item, rating);
    const items = await loadLocal();
    const idx = items.findIndex((i) => i.id === item.id || i.item_id === item.item_id);
    if (idx >= 0) items[idx] = { ...items[idx], ...updated };
    else items.push(updated);
    await saveLocal(items);

    if (cloudOn() && supabase && auth.currentUser && updated.id) {
      const { error } = await supabase
        .from("srs_items")
        .upsert({
          id: updated.id,
          user_id: auth.currentUser.uid,
          keycard_id: updated.keycard_id || "global",
          item_id: updated.item_id,
          item_type: updated.item_type,
          content: updated.content,
          easiness: updated.easiness,
          interval: updated.interval,
          repetition: updated.repetition,
          next_review: updated.next_review,
          updated_at: new Date().toISOString(),
        });
      if (error) console.warn("[SRS cloud update]", error.message);
    }
    return updated;
  },

  async removeItem(id: string) {
    const items = (await loadLocal()).filter((i) => i.id !== id && i.item_id !== id);
    await saveLocal(items);
    if (cloudOn() && supabase && auth.currentUser) {
      await supabase.from("srs_items").delete().eq("id", id).eq("user_id", auth.currentUser.uid);
    }
  },

  async clearSyncData() {
    try {
      await saveLocal([]);
      if (cloudOn() && supabase && auth.currentUser) {
        await supabase.from("srs_items").delete().eq("user_id", auth.currentUser.uid);
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },
};

/** Interleave retention repeats into a quiz sequence */
export const createRetentionSequence = (questions: any[], ratio: number = 0.6): any[] => {
  if (!questions?.length) return [];
  const out: any[] = [];
  const pool = [...questions];
  for (let i = 0; i < pool.length; i++) {
    out.push(pool[i]);
    if (i > 0 && Math.random() < ratio) {
      const back = pool[Math.floor(Math.random() * (i + 1))];
      out.push({ ...back, isReview: true, originalId: back.id, id: `${back.id}-r-${i}` });
    }
  }
  return out.map((q, idx) => ({ ...q, id: typeof q.id === "number" ? idx + 1 : q.id }));
};

export const getDueItems = (config?: any, keycardId?: string) =>
  NeuroSync.getDueItems(config, keycardId || "global");

export const processCardReview = async (
  _config?: any,
  item?: SRSItem,
  rating?: number
) => {
  if (!item || rating === undefined) return null;
  return NeuroSync.updateItem(item, rating);
};

export const addQuestionToSRS = async (
  config?: any,
  keycardId?: string,
  question?: any
) => {
  if (!question) return false;
  const item_id =
    question.item_id ||
    question.id?.toString?.() ||
    JSON.stringify(question.text || question).slice(0, 80);
  return NeuroSync.addItem(config, keycardId || "global", {
    item_id: String(item_id),
    item_type: "quiz_question",
    content: question,
  });
};

export default NeuroSync;
