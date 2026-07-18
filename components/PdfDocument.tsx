import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { DeepInsightData, Question, QuizResult } from '../types';

// ── COLOR PALETTE ──
const COLORS = {
  primary: '#4338ca',
  primaryLight: '#eef2ff',
  rose: '#e11d48',
  roseLight: '#fff1f2',
  roseBorder: '#fecdd3',
  emerald: '#059669',
  emeraldLight: '#ecfdf5',
  amber: '#d97706',
  amberLight: '#fffbeb',
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  slate50: '#f8fafc',
  white: '#ffffff',
};

// ── SHARED STYLES ──
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.slate800,
    backgroundColor: COLORS.white,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
  },
  // Header
  headerBar: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.slate200,
    paddingBottom: 12,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.slate900,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 9,
    color: COLORS.slate500,
    marginTop: 4,
  },
  // Summary card
  summaryCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  h2: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.primary,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 10,
    color: COLORS.slate700,
    lineHeight: 1.6,
  },
  studyPlanBox: {
    backgroundColor: COLORS.white,
    borderRadius: 6,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.slate200,
  },
  studyPlanLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.slate800,
    marginBottom: 4,
  },
  // Topic card
  topicCard: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  topicCardHigh: {
    backgroundColor: COLORS.roseLight,
    borderColor: COLORS.roseBorder,
    borderLeftColor: COLORS.rose,
  },
  topicCardModerate: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.slate200,
    borderLeftColor: COLORS.primary,
  },
  topicCardFiller: {
    backgroundColor: COLORS.slate50,
    borderColor: COLORS.slate200,
    borderLeftColor: COLORS.slate400,
  },
  badge: {
    fontSize: 7,
    fontWeight: 700,
    color: COLORS.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: 'flex-start',
    marginBottom: 6,
    letterSpacing: 1,
  },
  badgeHigh: { backgroundColor: COLORS.rose },
  badgeModerate: { backgroundColor: COLORS.primary },
  badgeFiller: { backgroundColor: COLORS.slate400 },
  topicTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  topicTitleHigh: { color: COLORS.rose },
  topicTitleModerate: { color: COLORS.primary },
  topicTitleFiller: { color: COLORS.slate600 },
  accuracyText: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 10,
  },
  accuracyGood: { color: COLORS.emerald },
  accuracyBad: { color: COLORS.rose },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.slate800,
    marginBottom: 6,
    marginTop: 12,
  },
  // Insight items
  insightItem: {
    backgroundColor: COLORS.white,
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.slate200,
  },
  insightPoint: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.slate800,
    marginBottom: 2,
  },
  insightEvidence: {
    fontSize: 9,
    color: COLORS.slate500,
    marginTop: 2,
    lineHeight: 1.4,
  },
  formulaBox: {
    backgroundColor: COLORS.slate900,
    borderRadius: 4,
    padding: 6,
    marginTop: 4,
  },
  formulaText: {
    fontSize: 8,
    color: '#6ee7b7',
    fontFamily: 'Courier',
  },
  // Trap items
  trapItem: {
    backgroundColor: COLORS.roseLight,
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.roseBorder,
  },
  trapWrong: {
    fontSize: 9,
    color: COLORS.rose,
    textDecoration: 'line-through',
    marginBottom: 2,
  },
  trapCorrect: {
    fontSize: 9,
    color: COLORS.emerald,
    fontWeight: 700,
  },
  // Mnemonic box
  mnemonicBox: {
    borderRadius: 6,
    padding: 10,
    marginTop: 12,
  },
  mnemonicBoxHigh: { backgroundColor: '#fce7f3' },
  mnemonicBoxModerate: { backgroundColor: COLORS.primaryLight },
  mnemonicLabel: {
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  mnemonicText: {
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.4,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: COLORS.slate400,
  },
  // Connections
  connectionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  connectionChip: {
    backgroundColor: COLORS.slate100,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8,
    color: COLORS.slate600,
    borderWidth: 1,
    borderColor: COLORS.slate200,
  },
  // Question card (for non-AI overview)
  questionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.slate200,
  },
  questionText: {
    fontSize: 10,
    color: COLORS.slate800,
    fontWeight: 700,
    lineHeight: 1.5,
    marginBottom: 4,
  },
  answerCorrect: {
    fontSize: 9,
    color: COLORS.emerald,
    fontWeight: 700,
    marginBottom: 2,
  },
  answerWrong: {
    fontSize: 9,
    color: COLORS.rose,
    marginBottom: 2,
  },
  explanationText: {
    fontSize: 9,
    color: COLORS.slate600,
    lineHeight: 1.4,
    marginTop: 4,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.slate200,
  },
  // Divider
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.slate200,
    marginVertical: 16,
  },
});

// ── HELPER: get priority-specific styles ──
const getPriorityStyles = (priority: string) => {
  switch (priority) {
    case 'HIGH': return {
      card: s.topicCardHigh,
      badge: s.badgeHigh,
      title: s.topicTitleHigh,
      mnemonic: s.mnemonicBoxHigh,
      label: 'HIGH-YIELD',
      mnemonicLabelColor: COLORS.rose,
    };
    case 'FILLER': return {
      card: s.topicCardFiller,
      badge: s.badgeFiller,
      title: s.topicTitleFiller,
      mnemonic: s.mnemonicBoxModerate,
      label: 'FILLER',
      mnemonicLabelColor: COLORS.slate500,
    };
    default: return {
      card: s.topicCardModerate,
      badge: s.badgeModerate,
      title: s.topicTitleModerate,
      mnemonic: s.mnemonicBoxModerate,
      label: 'MODERATE',
      mnemonicLabelColor: COLORS.primary,
    };
  }
};

// ── FOOTER COMPONENT ──
const PageFooter = () => (
  <View style={s.footer} fixed>
    <Text>Generated by Noodl ( •_•)⌐■-■</Text>
    <Text render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} / ${totalPages}`} />
  </View>
);

// ════════════════════════════════════════════════
// DEEP INSIGHT PDF DOCUMENT
// ════════════════════════════════════════════════
interface DeepInsightPdfProps {
  data: DeepInsightData;
  title: string;
}

export const DeepInsightPdf: React.FC<DeepInsightPdfProps> = ({ data, title }) => {
  const topicEntries = Object.values(data.topics);
  const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Document title={`Peta Pemahaman - ${title}`} author="Noodl App" subject={title}>
      <Page size="A4" style={s.page} wrap>
        <PageFooter />

        {/* HEADER */}
        <View style={s.headerBar} fixed>
          <Text style={s.title}>PETA PEMAHAMAN</Text>
          <Text style={s.subtitle}>Topik: {title} • {now} • Generated by Noodl</Text>
        </View>

        {/* OVERALL SUMMARY */}
        <View style={s.summaryCard} wrap={false}>
          <Text style={s.h2}>Analisis Keseluruhan</Text>
          <Text style={s.bodyText}>{data.summary?.overallAssessment || ''}</Text>

          {data.summary?.strongAreas?.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ ...s.studyPlanLabel, color: COLORS.emerald }}>Area Kuat:</Text>
              <Text style={{ ...s.bodyText, fontSize: 9 }}>{data.summary.strongAreas.join(', ')}</Text>
            </View>
          )}

          {data.summary?.weakAreas?.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ ...s.studyPlanLabel, color: COLORS.rose }}>Area Perlu Perbaikan:</Text>
              <Text style={{ ...s.bodyText, fontSize: 9 }}>{data.summary.weakAreas.join(', ')}</Text>
            </View>
          )}

          <View style={s.studyPlanBox}>
            <Text style={s.studyPlanLabel}>Rencana Belajar:</Text>
            <Text style={{ ...s.bodyText, fontSize: 9 }}>{data.summary?.studyPlan || ''}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* TOPIC CARDS */}
        {topicEntries.map((t, idx) => {
          const ps = getPriorityStyles(t.priority);
          return (
            <View key={idx} style={[s.topicCard, ps.card]} wrap>
              {/* Header row */}
              <View style={s.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.badge, ps.badge]}>{ps.label}</Text>
                  <Text style={[s.topicTitle, ps.title]}>{t.topic}</Text>
                </View>
                {t.accuracy !== null && (
                  <Text style={[
                    s.accuracyText,
                    t.accuracy >= 70 ? s.accuracyGood : s.accuracyBad,
                  ]}>
                    Skor: {t.accuracy}%
                  </Text>
                )}
              </View>

              {/* Summary */}
              <Text style={s.sectionLabel}>Definisi / Konsep Inti</Text>
              <Text style={s.bodyText}>{t.summary}</Text>

              {/* Insights */}
              {t.insights && t.insights.length > 0 && (
                <View>
                  <Text style={s.sectionLabel}>Insight Penting</Text>
                  {t.insights.map((ins, i) => (
                    <View key={i} style={s.insightItem} wrap={false}>
                      <Text style={s.insightPoint}>• {ins.point}</Text>
                      {ins.evidence && <Text style={s.insightEvidence}>{ins.evidence}</Text>}
                      {ins.formula && (
                        <View style={s.formulaBox}>
                          <Text style={s.formulaText}>{ins.formula}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Traps */}
              {t.traps && t.traps.length > 0 && (
                <View>
                  <Text style={{ ...s.sectionLabel, color: COLORS.rose }}>Jebakan Umum</Text>
                  {t.traps.map((trap, i) => (
                    <View key={i} style={s.trapItem} wrap={false}>
                      <Text style={s.trapWrong}>[Salah] {trap.trap}</Text>
                      <Text style={s.trapCorrect}>[Benar] {trap.correction}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Mnemonic */}
              {t.mnemonic && (
                <View style={[s.mnemonicBox, ps.mnemonic]} wrap={false}>
                  <Text style={{ ...s.mnemonicLabel, color: ps.mnemonicLabelColor }}>
                    INGAT INI:
                  </Text>
                  <Text style={{ ...s.mnemonicText, color: ps.mnemonicLabelColor }}>
                    {t.mnemonic}
                  </Text>
                </View>
              )}

              {/* Connections */}
              {t.connections && t.connections.length > 0 && (
                <View style={s.connectionsRow}>
                  {t.connections.map((conn, i) => (
                    <Text key={i} style={s.connectionChip}>- {conn}</Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Motivational quote */}
        {data.summary?.motivationalQuote && (
          <View style={{ ...s.summaryCard, marginTop: 12, textAlign: 'center' }} wrap={false}>
            <Text style={{ ...s.bodyText, fontStyle: 'italic', textAlign: 'center', fontSize: 11 }}>
              "{data.summary.motivationalQuote}"
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
};

// ════════════════════════════════════════════════
// OVERVIEW PDF DOCUMENT (Non-AI, question-based)
// ════════════════════════════════════════════════
interface OverviewPdfProps {
  groupedData: Record<string, {
    priority: string;
    questions: Question[];
    totalAnswers: number;
    correctAnswers: number;
  }>;
  questions: Question[];
  result?: QuizResult | null;
  title: string;
}

export const OverviewPdf: React.FC<OverviewPdfProps> = ({ groupedData, questions, result, title }) => {
  const now = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  
  // Sort by priority
  const priorityWeight: Record<string, number> = { 'HIGH': 3, 'MODERATE': 2, 'FILLER': 1 };
  const sortedTopics = Object.keys(groupedData).sort((a, b) => {
    const wA = priorityWeight[groupedData[a].priority] || 2;
    const wB = priorityWeight[groupedData[b].priority] || 2;
    return wB - wA;
  });

  return (
    <Document title={`Peta Pemahaman - ${title}`} author="Noodl App" subject={title}>
      <Page size="A4" style={s.page} wrap>
        <PageFooter />

        <View style={s.headerBar} fixed>
          <Text style={s.title}>PETA PEMAHAMAN</Text>
          <Text style={s.subtitle}>Topik: {title} • {now}</Text>
        </View>

        {/* Stats summary */}
        {result && (
          <View style={s.summaryCard} wrap={false}>
            <Text style={s.h2}>Ringkasan Hasil</Text>
            <Text style={s.bodyText}>
              Skor: {result.correctCount}/{result.totalQuestions} ({Math.round((result.correctCount / result.totalQuestions) * 100)}%)
            </Text>
          </View>
        )}

        {/* Topic sections */}
        {sortedTopics.map((topic, idx) => {
          const data = groupedData[topic];
          const ps = getPriorityStyles(data.priority);
          const accuracy = data.totalAnswers > 0 
            ? Math.round((data.correctAnswers / data.totalAnswers) * 100) 
            : null;

          return (
            <View key={idx} style={[s.topicCard, ps.card]} wrap>
              <View style={s.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.badge, ps.badge]}>{ps.label}</Text>
                  <Text style={[s.topicTitle, ps.title]}>{topic}</Text>
                </View>
                {accuracy !== null && (
                  <Text style={[s.accuracyText, accuracy >= 70 ? s.accuracyGood : s.accuracyBad]}>
                    Penguasaan: {accuracy}%
                  </Text>
                )}
              </View>

              {/* Questions */}
              {data.questions.map((q, qIdx) => {
                const answerObj = result ? result.answers.find(a => a.questionId === q.id) : null;
                const isCorrect = answerObj ? answerObj.isCorrect : null;

                return (
                  <View key={qIdx} style={s.questionCard} wrap={false}>
                    <Text style={s.questionText}>{q.text}</Text>

                    {answerObj && (
                      <View>
                        {isCorrect ? (
                          <Text style={s.answerCorrect}>[Benar] Jawaban Anda: {q.options[q.correctIndex]}</Text>
                        ) : (
                          <View>
                            <Text style={s.answerWrong}>
                              [Salah] Jawaban Anda: {q.options[answerObj.selectedIndex]}
                            </Text>
                            <Text style={s.answerCorrect}>
                              [Seharusnya]: {q.options[q.correctIndex]}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {!result && (
                      <Text style={s.answerCorrect}>Kunci: {q.options[q.correctIndex]}</Text>
                    )}

                    <Text style={s.explanationText}>{q.explanation}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </Page>
    </Document>
  );
};
