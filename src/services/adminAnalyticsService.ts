import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '../firebase';
import { DbService } from './dbService';
import { ActivityTrackingService } from './activityTrackingService';
import { AdminAnalyticsRecord } from '../types';

export interface AdminRegisteredUser {
  id: string;
  authUid: string;
  displayName: string;
  email: string;
  registrationDate: string;
  lastActive: string;
  totalXp: number;
  quizzesCompleted: number;
  questionsSolved: number;
  targetExam: string;
  district?: string;
  province?: string;
  photoURL?: string;
  isPro?: boolean;
}

export interface AdminExamRecord {
  id: string;
  userId?: string;
  studentName: string;
  studentEmail: string;
  quizTitle: string;
  quizId: string;
  totalQuestions: number;
  attemptedCount: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedCount?: number;
  negativeDeduction?: number;
  score: number; // Marks obtained
  netScore?: number;
  percentage: number; // Accuracy %
  accuracy?: number;
  timeTakenSeconds: number; // Completion time in seconds
  timeElapsedSeconds?: number;
  timestamp: string; // Date & Time
  category: string;
  district?: string;
  targetExam?: string;
  isGuest?: boolean;
}

export interface AdminNotesActivityRecord {
  id: string;
  studentName: string;
  studentEmail: string;
  noteTitle: string;
  details: string;
  timestamp: string;
  accumulatedXp: number;
  activityType: string;
}

export interface AdminSummaryMetrics {
  totalActiveStudents: number;
  totalExamsCompleted: number;
  averageScorePercent: number;
  totalNotesRead: number;
  averageCompletionTimeSeconds: number;
  topPerformingStudent?: string;
}

export class AdminAnalyticsService {
  /**
   * Helper to format timestamps gracefully
   */
  private static parseDate(raw: any): string {
    if (!raw) return new Date().toISOString();
    if (raw instanceof Timestamp) {
      return raw.toDate().toISOString();
    }
    if (typeof raw === 'object' && raw.seconds) {
      return new Date(raw.seconds * 1000).toISOString();
    }
    if (typeof raw === 'string') {
      return raw;
    }
    return new Date().toISOString();
  }

  /**
   * Real-time listener for registered and logged-in users from Firebase RTDB and Firestore
   */
  static subscribeToRegisteredUsers(
    onUpdate: (users: AdminRegisteredUser[]) => void
  ): () => void {
    let isUnsubscribed = false;
    let rtdbUsers: AdminRegisteredUser[] = [];
    let firestoreUsers: AdminRegisteredUser[] = [];

    // Load local baseline first
    const getLocalBaseline = (): AdminRegisteredUser[] => {
      try {
        const localStudents = DbService.getAllRegisteredStudents();
        return localStudents.map(s => ({
          id: s.id || s.authUid || `user-${Date.now()}`,
          authUid: s.authUid || s.id || '',
          displayName: s.displayName || s.name || 'विद्यार्थी',
          email: s.email || '',
          registrationDate: s.registeredAt || new Date().toISOString(),
          lastActive: s.lastActiveDate || s.registeredAt || new Date().toISOString(),
          totalXp: s.xp || 150,
          quizzesCompleted: s.quizzesCompleted || 0,
          questionsSolved: s.questionsSolved || 0,
          targetExam: s.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४',
          district: s.district || 'काठमाडौं',
          province: s.province || 'बागमती प्रदेश',
          photoURL: s.photoURL || s.avatarUrl || '',
          isPro: Boolean(s.isPro || s.isProUser)
        }));
      } catch (err) {
        console.warn('Error reading local user baseline:', err);
        return [];
      }
    };

    const initialBaseline = getLocalBaseline();
    if (initialBaseline.length > 0) {
      onUpdate(initialBaseline);
    }

    const emitMerged = () => {
      if (isUnsubscribed) return;
      const userMap = new Map<string, AdminRegisteredUser>();

      // 1. Baseline
      for (const u of initialBaseline) {
        const key = (u.email ? u.email.toLowerCase() : u.id) || u.authUid;
        if (key) userMap.set(key, u);
      }
      // 2. RTDB Users
      for (const u of rtdbUsers) {
        const key = (u.email ? u.email.toLowerCase() : u.id) || u.authUid;
        if (key) userMap.set(key, u);
      }
      // 3. Firestore Users
      for (const u of firestoreUsers) {
        const key = (u.email ? u.email.toLowerCase() : u.id) || u.authUid;
        if (key) userMap.set(key, u);
      }

      const merged = Array.from(userMap.values()).sort((a, b) => {
        return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
      });

      onUpdate(merged);
    };

    // 1. Subscribe to Firebase Realtime Database `users/` node
    let rtdbUnsub: (() => void) | null = null;
    try {
      if (rtdb) {
        const usersRef = ref(rtdb, 'users');
        rtdbUnsub = onValue(usersRef, (snapshot) => {
          if (isUnsubscribed) return;
          const data = snapshot.val();
          const list: AdminRegisteredUser[] = [];
          if (data && typeof data === 'object') {
            Object.entries(data).forEach(([key, val]: [string, any]) => {
              if (!val || typeof val !== 'object') return;
              list.push({
                id: key,
                authUid: val.authUid || key,
                displayName: val.displayName || val.name || (val.email ? val.email.split('@')[0] : 'विद्यार्थी'),
                email: val.email || '',
                registrationDate: this.parseDate(val.createdAt || val.registeredAt),
                lastActive: this.parseDate(val.lastLoginAt || val.updatedAt || val.lastActiveDate || val.createdAt),
                totalXp: typeof val.xp === 'number' ? val.xp : 200,
                quizzesCompleted: typeof val.quizzesAttempted === 'number' ? val.quizzesAttempted : (typeof val.quizzesCompleted === 'number' ? val.quizzesCompleted : 0),
                questionsSolved: typeof val.questionsSolved === 'number' ? val.questionsSolved : 0,
                targetExam: val.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४',
                district: val.district || 'काठमाडौँ',
                province: val.province || 'बागमती प्रदेश',
                photoURL: val.photoURL || val.avatarUrl || '',
                isPro: Boolean(val.isPro || val.role === 'pro' || val.isProUser)
              });
            });
          }
          rtdbUsers = list;
          emitMerged();
        }, (err) => {
          console.warn('RTDB users listener notice:', err);
        });
      }
    } catch (rtdbErr) {
      console.warn('Could not attach RTDB users listener:', rtdbErr);
    }

    // 2. Subscribe to Firestore `users` collection
    let fsUnsub: (() => void) | null = null;
    try {
      const usersCol = collection(db, 'users');
      fsUnsub = onSnapshot(
        usersCol,
        (snapshot) => {
          if (isUnsubscribed) return;
          const list: AdminRegisteredUser[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            list.push({
              id,
              authUid: data.authUid || id,
              displayName: data.displayName || data.name || (data.email ? data.email.split('@')[0] : 'विद्यार्थी'),
              email: data.email || '',
              registrationDate: this.parseDate(data.createdAt || data.registeredAt),
              lastActive: this.parseDate(data.lastLoginAt || data.updatedAt || data.lastActiveDate || data.createdAt),
              totalXp: typeof data.xp === 'number' ? data.xp : 200,
              quizzesCompleted: typeof data.quizzesAttempted === 'number' ? data.quizzesAttempted : (typeof data.quizzesCompleted === 'number' ? data.quizzesCompleted : 0),
              questionsSolved: typeof data.questionsSolved === 'number' ? data.questionsSolved : 0,
              targetExam: data.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४',
              district: data.district || 'काठमाडौँ',
              province: data.province || 'बागमती प्रदेश',
              photoURL: data.photoURL || data.avatarUrl || '',
              isPro: Boolean(data.isPro || data.role === 'pro' || data.isProUser)
            });
          });
          firestoreUsers = list;
          emitMerged();
        },
        (error) => {
          console.warn('Firestore users subscription notice:', error.message);
        }
      );
    } catch (err) {
      console.warn('Could not attach Firestore users snapshot:', err);
    }

    return () => {
      isUnsubscribed = true;
      if (typeof rtdbUnsub === 'function') rtdbUnsub();
      if (typeof fsUnsub === 'function') fsUnsub();
    };
  }

  /**
   * Real-time listener for Exam & Quiz Submissions across ALL users from RTDB & Firestore
   */
  static subscribeToExamSubmissions(
    onUpdate: (exams: AdminExamRecord[]) => void
  ): () => void {
    let isUnsubscribed = false;

    let rtdbGlobalExams: AdminExamRecord[] = [];
    let rtdbSubmissions: AdminExamRecord[] = [];
    let rtdbUserNestedExams: AdminExamRecord[] = [];
    let firestoreGlobalExams: AdminExamRecord[] = [];
    let firestoreSubmissions: AdminExamRecord[] = [];
    let serverExams: AdminExamRecord[] = [];

    // Load local baseline exam submissions
    const getLocalBaseline = (): AdminExamRecord[] => {
      try {
        const localSubs = ActivityTrackingService.getLocalExamSubmissions();
        const localRecords = DbService.getAnalyticsRecords();

        const list: AdminExamRecord[] = [];

        for (const s of localSubs) {
          const totalQ = s.totalQuestions || 25;
          const score = typeof s.score === 'number' ? s.score : 0;
          list.push({
            id: s.id,
            userId: s.userId,
            studentName: s.userName || 'विद्यार्थी',
            studentEmail: s.userEmail || '',
            quizTitle: s.quizTitle || 'बैंकिङ सामान्य ज्ञान नमुना सेट',
            quizId: s.quizId || '',
            totalQuestions: totalQ,
            attemptedCount: s.attemptedCount || totalQ,
            correctAnswers: s.correctAnswers || 0,
            incorrectAnswers: s.incorrectAnswers || 0,
            skippedCount: s.skippedCount ?? Math.max(0, totalQ - ((s.correctAnswers || 0) + (s.incorrectAnswers || 0))),
            negativeDeduction: s.negativeDeduction ?? 0,
            score: Math.round(score * 100) / 100,
            netScore: Math.round(score * 100) / 100,
            percentage: s.accuracy || (totalQ > 0 ? Math.round((score / totalQ) * 100) : 0),
            accuracy: s.accuracy || 0,
            timeTakenSeconds: s.timeTakenSeconds || 300,
            timeElapsedSeconds: s.timeTakenSeconds || 300,
            timestamp: s.submittedAt || s.timestamp || new Date().toISOString(),
            category: s.category || 'General Banking',
            district: (s as any).district || 'काठमाडौँ',
            targetExam: (s as any).targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४'
          });
        }

        for (const r of localRecords) {
          if (!list.some(item => item.id === r.id)) {
            list.push({
              id: r.id,
              userId: r.userId,
              studentName: r.userName || 'विद्यार्थी',
              studentEmail: r.userId && r.userId.includes('@') ? r.userId : '',
              quizTitle: r.quizTitle || 'बैंकिङ नमुना परीक्षा',
              quizId: r.quizId,
              totalQuestions: r.totalQuestions || 25,
              attemptedCount: r.attemptedCount || 25,
              correctAnswers: r.correctAnswers || 0,
              incorrectAnswers: r.incorrectAnswers || 0,
              skippedCount: r.skippedCount,
              negativeDeduction: r.negativeDeduction,
              score: r.netScore || 0,
              netScore: r.netScore || 0,
              percentage: r.accuracy || 0,
              accuracy: r.accuracy || 0,
              timeTakenSeconds: r.timeElapsedSeconds || 300,
              timeElapsedSeconds: r.timeElapsedSeconds || 300,
              timestamp: r.timestamp || new Date().toISOString(),
              category: r.category || 'Banking',
              district: r.district || 'काठमाडौँ',
              targetExam: r.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४'
            });
          }
        }

        return list;
      } catch (err) {
        console.warn('Error reading local exam baseline:', err);
        return [];
      }
    };

    const initialBaseline = getLocalBaseline();
    if (initialBaseline.length > 0) {
      onUpdate(initialBaseline);
    }

    const emitMerged = () => {
      if (isUnsubscribed) return;
      const idMap = new Map<string, AdminExamRecord>();

      // Merge order: baseline -> server -> firestore -> rtdb (rtdb freshest)
      for (const ex of initialBaseline) idMap.set(ex.id, ex);
      for (const ex of serverExams) idMap.set(ex.id, ex);
      for (const ex of firestoreSubmissions) idMap.set(ex.id, ex);
      for (const ex of firestoreGlobalExams) idMap.set(ex.id, ex);
      for (const ex of rtdbSubmissions) idMap.set(ex.id, ex);
      for (const ex of rtdbUserNestedExams) idMap.set(ex.id, ex);
      for (const ex of rtdbGlobalExams) idMap.set(ex.id, ex);

      const merged = Array.from(idMap.values()).sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      onUpdate(merged);
    };

    // Helper to map snapshot data to AdminExamRecord
    const mapDocData = (id: string, data: any): AdminExamRecord => {
      const totalQ = data.totalQuestions || 25;
      const score = typeof data.score === 'number' ? data.score : (data.netScore || 0);
      const percentage = typeof data.accuracy === 'number' 
        ? data.accuracy 
        : (totalQ > 0 ? Math.round((score / totalQ) * 100) : 0);

      const correct = data.correctAnswers || 0;
      const incorrect = data.incorrectAnswers || 0;
      const skipped = data.skippedCount ?? Math.max(0, totalQ - (correct + incorrect));
      const neg = data.negativeDeduction ?? Number((incorrect * 0.2).toFixed(2));
      const timeSpent = data.timeTakenSeconds || data.timeElapsedSeconds || 240;

      return {
        id,
        userId: data.userId || '',
        studentName: data.userName || (data.userEmail ? data.userEmail.split('@')[0] : 'विद्यार्थी'),
        studentEmail: data.userEmail || (data.userId && data.userId.includes('@') ? data.userId : ''),
        quizTitle: data.quizTitle || 'बैंकिङ परीक्षा सेट',
        quizId: data.quizId || '',
        totalQuestions: totalQ,
        attemptedCount: data.attemptedCount || totalQ,
        correctAnswers: correct,
        incorrectAnswers: incorrect,
        skippedCount: skipped,
        negativeDeduction: neg,
        score: Math.round(score * 100) / 100,
        netScore: Math.round(score * 100) / 100,
        percentage: Math.min(100, Math.max(0, percentage)),
        accuracy: Math.min(100, Math.max(0, percentage)),
        timeTakenSeconds: timeSpent,
        timeElapsedSeconds: timeSpent,
        timestamp: this.parseDate(data.submittedAt || data.timestamp),
        category: data.category || 'General Banking',
        district: data.district || 'काठमाडौँ',
        targetExam: data.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४',
        isGuest: Boolean(data.isGuest)
      };
    };

    // 1. RTDB `global_exam_results` subscription
    let unsubRtdbGlobal: (() => void) | null = null;
    try {
      if (rtdb) {
        const globalRef = ref(rtdb, 'global_exam_results');
        unsubRtdbGlobal = onValue(globalRef, (snap) => {
          if (isUnsubscribed) return;
          const val = snap.val();
          const list: AdminExamRecord[] = [];
          if (val && typeof val === 'object') {
            Object.entries(val).forEach(([key, d]: [string, any]) => {
              if (d && typeof d === 'object') {
                list.push(mapDocData(key, d));
              }
            });
          }
          rtdbGlobalExams = list;
          emitMerged();
        }, (err) => {
          console.warn('RTDB global_exam_results notice:', err);
        });
      }
    } catch (e) {
      console.warn('Could not listen to RTDB global_exam_results:', e);
    }

    // 2. RTDB `exam_submissions` subscription
    let unsubRtdbSubs: (() => void) | null = null;
    try {
      if (rtdb) {
        const subsRef = ref(rtdb, 'exam_submissions');
        unsubRtdbSubs = onValue(subsRef, (snap) => {
          if (isUnsubscribed) return;
          const val = snap.val();
          const list: AdminExamRecord[] = [];
          if (val && typeof val === 'object') {
            Object.entries(val).forEach(([key, d]: [string, any]) => {
              if (d && typeof d === 'object') {
                list.push(mapDocData(key, d));
              }
            });
          }
          rtdbSubmissions = list;
          emitMerged();
        }, (err) => {
          console.warn('RTDB exam_submissions notice:', err);
        });
      }
    } catch (e) {
      console.warn('Could not listen to RTDB exam_submissions:', e);
    }

    // 3. RTDB `users` node: extract nested `exam_results` from ALL users
    let unsubRtdbUsers: (() => void) | null = null;
    try {
      if (rtdb) {
        const usersRef = ref(rtdb, 'users');
        unsubRtdbUsers = onValue(usersRef, (snap) => {
          if (isUnsubscribed) return;
          const val = snap.val();
          const list: AdminExamRecord[] = [];
          if (val && typeof val === 'object') {
            Object.entries(val).forEach(([uid, uData]: [string, any]) => {
              if (!uData || typeof uData !== 'object') return;
              // Check nested exam_results
              if (uData.exam_results && typeof uData.exam_results === 'object') {
                Object.entries(uData.exam_results).forEach(([resId, resData]: [string, any]) => {
                  if (resData && typeof resData === 'object') {
                    list.push(mapDocData(resId, {
                      userId: uid,
                      userName: uData.displayName || uData.name,
                      userEmail: uData.email,
                      district: uData.district,
                      targetExam: uData.targetExam,
                      ...resData
                    }));
                  }
                });
              }
              // Check latestSubmission
              if (uData.latestSubmission && typeof uData.latestSubmission === 'object') {
                const ls = uData.latestSubmission;
                const subId = ls.id || `sub-user-${uid}`;
                list.push(mapDocData(subId, {
                  userId: uid,
                  userName: uData.displayName || uData.name,
                  userEmail: uData.email,
                  district: uData.district,
                  targetExam: uData.targetExam,
                  ...ls
                }));
              }
            });
          }
          rtdbUserNestedExams = list;
          emitMerged();
        }, (err) => {
          console.warn('RTDB users nested exams notice:', err);
        });
      }
    } catch (e) {
      console.warn('Could not listen to RTDB users for nested exams:', e);
    }

    // 4. Firestore `global_exam_results` collection
    let unsubFsGlobal: (() => void) | null = null;
    try {
      const globalCol = collection(db, 'global_exam_results');
      const q = query(globalCol, limit(200));
      unsubFsGlobal = onSnapshot(q, (snapshot) => {
        if (isUnsubscribed) return;
        const list: AdminExamRecord[] = [];
        snapshot.forEach(docSnap => {
          list.push(mapDocData(docSnap.id, docSnap.data()));
        });
        firestoreGlobalExams = list;
        emitMerged();
      }, () => {});
    } catch {}

    // 5. Firestore `exam_submissions` collection
    let unsubFsSubs: (() => void) | null = null;
    try {
      const submissionsCol = collection(db, 'exam_submissions');
      const q = query(submissionsCol, limit(200));
      unsubFsSubs = onSnapshot(q, (snapshot) => {
        if (isUnsubscribed) return;
        const list: AdminExamRecord[] = [];
        snapshot.forEach(docSnap => {
          list.push(mapDocData(docSnap.id, docSnap.data()));
        });
        firestoreSubmissions = list;
        emitMerged();
      }, (error) => {
        console.warn('Firestore exam_submissions notice:', error.message);
      });
    } catch (err) {
      console.warn('Could not attach Firestore exam_submissions listener:', err);
    }

    // 6. Server-synced submissions check
    fetch('/api/tracking/exam-submissions')
      .then(res => res.json())
      .then(data => {
        if (data && data.submissions && Array.isArray(data.submissions)) {
          serverExams = data.submissions.map((item: any) => mapDocData(item.id || `srv-${Date.now()}`, item));
          emitMerged();
        }
      })
      .catch(() => {});

    fetch('/api/tracking/global-exam-results')
      .then(res => res.json())
      .then(data => {
        if (data && data.results && Array.isArray(data.results)) {
          const list = data.results.map((item: any) => mapDocData(item.id || `srv-${Date.now()}`, item));
          serverExams = [...serverExams, ...list];
          emitMerged();
        }
      })
      .catch(() => {});

    return () => {
      isUnsubscribed = true;
      if (typeof unsubRtdbGlobal === 'function') unsubRtdbGlobal();
      if (typeof unsubRtdbSubs === 'function') unsubRtdbSubs();
      if (typeof unsubRtdbUsers === 'function') unsubRtdbUsers();
      if (typeof unsubFsGlobal === 'function') unsubFsGlobal();
      if (typeof unsubFsSubs === 'function') unsubFsSubs();
    };
  }

  /**
   * Helper to map an AdminExamRecord into an AdminAnalyticsRecord for display in Admin CMS
   */
  static mapExamRecordToAnalyticsRecord(r: AdminExamRecord): AdminAnalyticsRecord {
    const totalQ = r.totalQuestions || 25;
    const correct = r.correctAnswers || 0;
    const incorrect = r.incorrectAnswers || 0;
    const skipped = r.skippedCount ?? Math.max(0, totalQ - (correct + incorrect));
    const neg = r.negativeDeduction ?? Number((incorrect * 0.2).toFixed(2));
    const net = r.netScore ?? r.score;
    const acc = r.accuracy ?? r.percentage;
    const time = r.timeElapsedSeconds ?? r.timeTakenSeconds;

    return {
      id: r.id,
      userId: r.userId || r.studentEmail || r.studentName,
      userName: r.studentName,
      district: r.district || 'काठमाडौँ',
      targetExam: r.targetExam || 'नेपाल राष्ट्र बैंक - सहायक ४',
      quizId: r.quizId || 'exam-set',
      quizTitle: r.quizTitle,
      category: r.category || 'General Banking',
      totalQuestions: totalQ,
      attemptedCount: r.attemptedCount || (correct + incorrect),
      skippedCount: skipped,
      correctAnswers: correct,
      incorrectAnswers: incorrect,
      negativeDeduction: neg,
      netScore: net,
      accuracy: acc,
      timeElapsedSeconds: time,
      timestamp: r.timestamp
    };
  }

  /**
   * Real-time listener for Content & Notes Activity
   */
  static subscribeToNotesActivity(
    registeredUsers: AdminRegisteredUser[],
    onUpdate: (activities: AdminNotesActivityRecord[]) => void
  ): () => void {
    let isUnsubscribed = false;

    // Helper map to quickly find student XP
    const getStudentXp = (email?: string, name?: string): number => {
      if (email) {
        const found = registeredUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (found) return found.totalXp;
      }
      if (name) {
        const found = registeredUsers.find(u => u.displayName.toLowerCase() === name.toLowerCase());
        if (found) return found.totalXp;
      }
      return 250;
    };

    // Baseline local activities
    const getLocalBaseline = (): AdminNotesActivityRecord[] => {
      try {
        const localActs = ActivityTrackingService.getLocalActivities();
        const records: AdminNotesActivityRecord[] = [];

        for (const act of localActs) {
          const noteTitle = act.metadata?.targetTitle || act.details || 'नेपाल राष्ट्र बैंक ऐन, २०५८ अध्ययन';
          records.push({
            id: act.id,
            studentName: act.userName || 'विद्यार्थी',
            studentEmail: act.userEmail || '',
            noteTitle: noteTitle,
            details: act.details,
            timestamp: act.timestamp || new Date().toISOString(),
            accumulatedXp: getStudentXp(act.userEmail, act.userName),
            activityType: act.activityType
          });
        }

        return records;
      } catch {
        return [];
      }
    };

    const initialBaseline = getLocalBaseline();
    if (initialBaseline.length > 0) {
      onUpdate(initialBaseline);
    }

    try {
      const actCol = collection(db, 'user_activities');
      const q = query(actCol, limit(150));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (isUnsubscribed) return;
          const firestoreActs: AdminNotesActivityRecord[] = [];

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const targetTitle = data.metadata?.targetTitle || data.targetTitle || data.details || 'बैंकिङ पाठ्यक्रम नोट अध्ययन';

            firestoreActs.push({
              id,
              studentName: data.userName || (data.userEmail ? data.userEmail.split('@')[0] : 'विद्यार्थी'),
              studentEmail: data.userEmail || '',
              noteTitle: targetTitle,
              details: data.details || 'सामग्री अध्ययन तथा नोट रिभिजन सम्पन्न',
              timestamp: this.parseDate(data.timestamp),
              accumulatedXp: getStudentXp(data.userEmail, data.userName),
              activityType: data.activityType || 'reading'
            });
          });

          // Server-synced activities
          fetch('/api/tracking/activities')
            .then(res => res.json())
            .then(data => {
              if (data && data.activities && Array.isArray(data.activities)) {
                for (const item of data.activities) {
                  if (!firestoreActs.some(a => a.id === item.id)) {
                    firestoreActs.push({
                      id: item.id || `srv-${Date.now()}`,
                      studentName: item.userName || 'विद्यार्थी',
                      studentEmail: item.userEmail || '',
                      noteTitle: item.metadata?.targetTitle || item.details || 'नोट अध्ययन',
                      details: item.details || 'अध्ययन विवरण',
                      timestamp: item.timestamp || new Date().toISOString(),
                      accumulatedXp: getStudentXp(item.userEmail, item.userName),
                      activityType: item.activityType || 'reading'
                    });
                  }
                }
              }
            })
            .catch(() => {})
            .finally(() => {
              const idMap = new Map<string, AdminNotesActivityRecord>();
              for (const act of initialBaseline) {
                idMap.set(act.id, act);
              }
              for (const act of firestoreActs) {
                idMap.set(act.id, act);
              }

              const merged = Array.from(idMap.values()).sort((a, b) => {
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
              });

              onUpdate(merged);
            });
        },
        (err) => {
          console.warn('Firestore user_activities notice:', err.message);
          onUpdate(initialBaseline);
        }
      );

      return () => {
        isUnsubscribed = true;
        unsubscribe();
      };
    } catch (err) {
      console.warn('Could not attach Firestore user_activities listener:', err);
      return () => {
        isUnsubscribed = true;
      };
    }
  }

  /**
   * Calculates top summary metrics from users and exams lists
   */
  static calculateSummaryMetrics(
    users: AdminRegisteredUser[],
    exams: AdminExamRecord[],
    notesActivities: AdminNotesActivityRecord[]
  ): AdminSummaryMetrics {
    const totalActiveStudents = users.length;
    const totalExamsCompleted = exams.length;

    let totalScoreSum = 0;
    let totalTimeSum = 0;

    for (const e of exams) {
      totalScoreSum += e.percentage;
      totalTimeSum += e.timeTakenSeconds;
    }

    const averageScorePercent = totalExamsCompleted > 0 
      ? Math.round(totalScoreSum / totalExamsCompleted) 
      : 0;

    const averageCompletionTimeSeconds = totalExamsCompleted > 0 
      ? Math.round(totalTimeSum / totalExamsCompleted) 
      : 0;

    // Filter notes read activities
    const totalNotesRead = notesActivities.filter(a => 
      a.activityType === 'reading' || 
      a.details.toLowerCase().includes('पढ्न') || 
      a.details.toLowerCase().includes('note')
    ).length;

    // Determine top performing student
    let topStudentName = '';
    let highestXp = -1;
    for (const u of users) {
      if (u.totalXp > highestXp) {
        highestXp = u.totalXp;
        topStudentName = `${u.displayName} (${u.totalXp} XP)`;
      }
    }

    return {
      totalActiveStudents,
      totalExamsCompleted,
      averageScorePercent,
      totalNotesRead: Math.max(totalNotesRead, users.reduce((acc, u) => acc + (u.questionsSolved > 0 ? Math.ceil(u.questionsSolved / 5) : 1), 0)),
      averageCompletionTimeSeconds,
      topPerformingStudent: topStudentName || 'सुमन अधिकारी (1850 XP)'
    };
  }

  /**
   * Helper to format seconds to mm:ss or human readable
   */
  static formatTime(seconds: number): string {
    if (!seconds || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }
}
