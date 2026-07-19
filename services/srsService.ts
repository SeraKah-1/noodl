/**
 * Neuro-Sync — SM-2 spaced repetition
 * Local IndexedDB is primary. Supabase syncs when signed in.
 */
import { SRSItem } from "../types";
import { auth, supabase, isSupabaseConfigured } from "../supabase";
import { get, set } from "idb-keyval";

import { KEYS } from "./storageKeys";
import { cloudSoftDeleteSrsRow, cloudUpsertSrsRow } from "./syncService";

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
    const normalizedKeycardId = keycardId || "global";
    const existing = items.find(
      (i) => i.keycard_id === normalizedKeycardId && i.item_id === item.item_id
    );
    if (existing && !existing.deleted_at) return existing;
    if (existing?.deleted_at) {
      const restored: SRSItem = {
        ...existing,
        ...item,
        deleted_at: null,
        next_review: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client_updated_at: new Date().toISOString(),
      };
      await saveLocal(items.map((entry) => entry.id === existing.id ? restored : entry));
      try {
        await cloudUpsertSrsRow(restored);
      } catch (error) {
        console.warn("[SRS restore queued]", error);
      }
      return restored;
    }

    const id = item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newItem: SRSItem = {
      keycard_id: normalizedKeycardId,
      item_id: item.item_id!,
      item_type: item.item_type || "quiz_question",
      content: item.content,
      easiness: 2.5,
      interval: 0,
      repetition: 0,
      next_review: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client_updated_at: new Date().toISOString(),
      ...item,
      id,
    };

    items.push(newItem);
    await saveLocal(items);

    try {
      await cloudUpsertSrsRow(newItem);
    } catch (error) {
      console.warn("[SRS add queued]", error);
    }
    return newItem;
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
          const cloudItems = data.map((row: any) => ({
            ...row,
            next_review:
              typeof row.next_review === "string"
                ? row.next_review
                : new Date(row.next_review).toISOString(),
          }));
          const localItems = await loadLocal();
          const merged = new Map<string, SRSItem>();
          for (const item of [...cloudItems, ...localItems]) {
            const key = `${item.keycard_id || "global"}:${item.item_id}`;
            const current = merged.get(key);
            const itemTime = new Date(item.updated_at || item.created_at || 0).getTime();
            const currentTime = new Date(current?.updated_at || current?.created_at || 0).getTime();
            if (!current || itemTime >= currentTime) merged.set(key, item);
          }
          const allItems = Array.from(merged.values());
          await saveLocal(allItems);
          const now = Date.now();
          return allItems
            .filter((item) => {
              if (keycardId && keycardId !== "global" && item.keycard_id !== keycardId) return false;
              return !item.deleted_at && new Date(item.next_review).getTime() <= now;
            })
            .sort((a, b) => +new Date(a.next_review) - +new Date(b.next_review));
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
        return !i.deleted_at && new Date(i.next_review).getTime() <= now;
      })
      .sort((a, b) => +new Date(a.next_review) - +new Date(b.next_review));
  },

  async getStats(_config: any, keycardId: string) {
    const items = await loadLocal();
    const visible = items.filter((item) => !item.deleted_at);
    const filtered =
      keycardId && keycardId !== "global"
        ? visible.filter((i) => i.keycard_id === keycardId)
        : visible;
    const now = Date.now();
    const due = filtered.filter((i) => +new Date(i.next_review) <= now).length;
    const learned = filtered.filter((i) => (i.repetition || 0) >= 2).length;
    return { total: filtered.length, due, learned };
  },

  async updateItem(item: SRSItem, rating: number) {
    const updated = this.calculateNextReview(item, rating);
    updated.client_updated_at = updated.updated_at;
    const items = await loadLocal();
    const idx = items.findIndex(
      (i) =>
        i.id === item.id ||
        (i.keycard_id === item.keycard_id && i.item_id === item.item_id)
    );
    if (idx >= 0) items[idx] = { ...items[idx], ...updated };
    else items.push(updated);
    await saveLocal(items);

    try {
      await cloudUpsertSrsRow(updated);
    } catch (error) {
      console.warn("[SRS update queued]", error);
    }
    return updated;
  },

  async removeItem(id: string) {
    const deletedAt = new Date().toISOString();
    const items = await loadLocal();
    const target = items.find((i) => i.id === id || i.item_id === id);
    if (!target?.id) return;
    await saveLocal(items.map((item) =>
      item.id === target.id
        ? { ...item, deleted_at: deletedAt, updated_at: deletedAt, client_updated_at: deletedAt }
        : item
    ));
    try {
      await cloudSoftDeleteSrsRow(target.id);
    } catch (error) {
      console.warn("[SRS delete queued]", error);
    }
  },

  async clearSyncData() {
    try {
      const items = await loadLocal();
      const deletedAt = new Date().toISOString();
      await saveLocal(items.map((item) => ({
        ...item,
        deleted_at: deletedAt,
        updated_at: deletedAt,
        client_updated_at: deletedAt,
      })));
      for (const item of items) {
        if (!item.id) continue;
        try {
          await cloudSoftDeleteSrsRow(item.id);
        } catch {
          // Each failed id is already preserved in the outbox.
        }
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
