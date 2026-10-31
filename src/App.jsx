import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import {
  auth,
  db,
  provider,
  ready,
  setAccessToken,
  getAccessToken,
  OperationType,
  handleFirestoreError,
  testConnection
} from './firebase';
import {
  fetchCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  taskToCalendarPayload
} from './calendarService';
import {
  CheckCircle2,
  Plus,
  Search,
  Sun,
  Moon,
  LogOut,
  Trash2,
  Edit3,
  BookOpen,
  ClipboardList,
  CalendarDays,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  User,
  Cloud
} from 'lucide-react';

const cats = [
  ['assignment', 'Assignment'],
  ['practical', 'Practical'],
  ['class-task', 'Class task'],
  ['exam', 'Exam'],
  ['other', 'Other']
];

const INITIAL_DEMO_TASKS = [
  {
    id: 'demo-1',
    title: 'Surveying Fieldwork Practical Report',
    subject: 'CE 249',
    category: 'practical',
    deadline: '2026-11-05',
    status: 'pending',
    syncedToCalendar: false,
    createdAt: Date.now() - 3600000 * 24
  },
  {
    id: 'demo-2',
    title: 'Fluid Mechanics Problem Set 4',
    subject: 'ME 201',
    category: 'assignment',
    deadline: '2026-11-08',
    status: 'pending',
    syncedToCalendar: false,
    createdAt: Date.now() - 3600000 * 12
  },
  {
    id: 'demo-3',
    title: 'Structural Analysis Midterm Exam',
    subject: 'CE 205',
    category: 'exam',
    deadline: '2026-11-15',
    status: 'pending',
    syncedToCalendar: false,
    createdAt: Date.now() - 3600000 * 48
  },
  {
    id: 'demo-4',
    title: 'Engineering Ethics Case Study Presentation',
    subject: 'HUM 111',
    category: 'class-task',
    deadline: '2026-10-30',
    status: 'completed',
    syncedToCalendar: false,
    createdAt: Date.now() - 3600000 * 72
  }
];

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tm-user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('tasks'); // 'tasks' or 'calendar'
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('assignment');
  const [deadline, setDeadline] = useState('');
  const [syncToCalOnCreate, setSyncToCalOnCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [theme, setTheme] = useState(() => localStorage.getItem('tm-theme') || 'dark');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Calendar states
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [hasCalendarToken, setHasCalendarToken] = useState(Boolean(getAccessToken()));

  // Confirmation modal state (MANDATORY for mutating Google Workspace data)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    isDestructive: false,
    onConfirm: null
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tm-theme', theme);
  }, [theme]);

  // Test connection on mount
  useEffect(() => {
    if (ready && db) {
      testConnection();
    }
  }, []);

  // Firebase Auth state listener
  useEffect(() => {
    if (!ready || !auth) return;
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      if (firebaseUser) {
        const userData = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || firebaseUser.email || 'Student',
          email: firebaseUser.email,
          isFirebase: true
        };
        setUser(userData);
        localStorage.setItem('tm-user', JSON.stringify(userData));
      } else {
        setUser(prev => {
          if (prev?.isFirebase) {
            localStorage.removeItem('tm-user');
            setAccessToken(null);
            setHasCalendarToken(false);
            return null;
          }
          return prev;
        });
      }
    });
    return unsubscribe;
  }, []);

  // Sync tasks from Firestore (for Firebase users) or LocalStorage (for guest users)
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    if (user.isFirebase && ready && db) {
      const taskPath = `users/${user.uid}/tasks`;
      const q = query(collection(db, 'users', user.uid, 'tasks'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          setTasks(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
        },
        err => {
          setError(err.message);
          try {
            handleFirestoreError(err, OperationType.GET, taskPath);
          } catch (e) {
            console.error('Handled Firestore permission error:', e);
          }
        }
      );
      return unsubscribe;
    }

    // Guest / local mode
    try {
      const stored = localStorage.getItem(`tm-tasks-${user.uid}`);
      if (stored) {
        setTasks(JSON.parse(stored));
      } else {
        setTasks(INITIAL_DEMO_TASKS);
        localStorage.setItem(`tm-tasks-${user.uid}`, JSON.stringify(INITIAL_DEMO_TASKS));
      }
    } catch {
      setTasks(INITIAL_DEMO_TASKS);
    }
  }, [user]);

  // Fetch Google Calendar events when opening the calendar tab
  const loadCalendarEvents = async () => {
    const token = getAccessToken();
    if (!token) {
      setHasCalendarToken(false);
      return;
    }
    setLoadingCalendar(true);
    setError('');
    try {
      const events = await fetchCalendarEvents(token);
      setCalendarEvents(events);
      setHasCalendarToken(true);
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      setError('Unable to load Google Calendar events: ' + err.message);
      if (err.message.includes('401') || err.message.includes('token')) {
        setHasCalendarToken(false);
        setAccessToken(null);
      }
    } finally {
      setLoadingCalendar(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'calendar' && user?.isFirebase) {
      loadCalendarEvents();
    }
  }, [activeTab, user?.isFirebase]);

  const stats = useMemo(
    () => ({
      total: tasks.length,
      done: tasks.filter(t => t.status === 'completed').length,
      pending: tasks.filter(t => t.status !== 'completed').length,
      synced: tasks.filter(t => t.syncedToCalendar).length
    }),
    [tasks]
  );

  const visible = tasks.filter(
    t =>
      (filter === 'all' || t.category === filter) &&
      (t.title + ' ' + (t.subject || '')).toLowerCase().includes(search.toLowerCase())
  );

  const persistLocalTasks = newTasks => {
    setTasks(newTasks);
    if (user?.uid) {
      localStorage.setItem(`tm-tasks-${user.uid}`, JSON.stringify(newTasks));
    }
  };

  async function handleGoogleSignIn() {
    setError('');
    setIsSigningIn(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = provider.constructor.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setHasCalendarToken(true);
      }

      const userData = {
        uid: result.user.uid,
        displayName: result.user.displayName || result.user.email || 'Student',
        email: result.user.email,
        isFirebase: true
      };
      setUser(userData);
      localStorage.setItem('tm-user', JSON.stringify(userData));
      return credential?.accessToken;
    } catch (err) {
      console.error('Google Sign-in Error:', err);
      setError(err.message || 'Failed to sign in with Google');
      return null;
    } finally {
      setIsSigningIn(false);
    }
  }

  function handleGuestSignIn() {
    setError('');
    const guestUser = {
      uid: 'guest-student-249',
      displayName: 'Demo Student',
      email: 'student@taskmate.local',
      isGuest: true
    };
    setUser(guestUser);
    localStorage.setItem('tm-user', JSON.stringify(guestUser));
  }

  async function handleSignOut() {
    if (user?.isFirebase && auth) {
      try {
        await signOut(auth);
      } catch (err) {
        console.error(err);
      }
    }
    setAccessToken(null);
    setHasCalendarToken(false);
    setUser(null);
    localStorage.removeItem('tm-user');
    setTasks([]);
  }

  // Request calendar sync authorization if token is not available
  async function ensureCalendarAuth() {
    const existing = getAccessToken();
    if (existing) return existing;
    try {
      setIsSigningIn(true);
      const result = await signInWithPopup(auth, provider);
      const credential = provider.constructor.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setHasCalendarToken(true);
        return credential.accessToken;
      }
      throw new Error('Could not obtain Google Calendar access token');
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsSigningIn(false);
    }
  }

  // CONFIRMATION-GATED: Sync a task to Google Calendar
  function promptSyncTaskToCalendar(task) {
    if (!user?.isFirebase) {
      setConfirmModal({
        isOpen: true,
        title: 'Connect Google Calendar',
        message: `To push "${task.title}" to Google Calendar, sign in with your Google account.`,
        confirmText: 'Sign in with Google',
        isDestructive: false,
        onConfirm: async () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          const token = await handleGoogleSignIn();
          if (token) {
            promptSyncTaskToCalendar(task);
          }
        }
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Push Task to Google Calendar',
      message: `Push "${task.title}" to your connected primary Google Calendar? Date: ${task.deadline || 'Today'}`,
      confirmText: 'Push to Calendar',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        const token = await ensureCalendarAuth();
        if (!token) return;

        try {
          const payload = taskToCalendarPayload(task);
          const calEvent = await createCalendarEvent(token, payload);

          // Update Firestore
          const docPath = `users/${user.uid}/tasks/${task.id}`;
          await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
            calendarEventId: calEvent.id,
            syncedToCalendar: true,
            updatedAt: serverTimestamp()
          });

          // Refresh calendar events if tab is open
          if (activeTab === 'calendar') {
            loadCalendarEvents();
          }
        } catch (err) {
          setError('Failed to push to Google Calendar: ' + err.message);
        }
      }
    });
  }

  // CONFIRMATION-GATED: Remove event from Google Calendar
  function promptRemoveFromCalendar(task) {
    if (!task.calendarEventId) return;

    setConfirmModal({
      isOpen: true,
      title: 'Remove from Google Calendar',
      message: `Are you sure you want to remove the event for "${task.title}" from your Google Calendar? This action cannot be undone.`,
      confirmText: 'Remove Event',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        const token = await ensureCalendarAuth();
        if (!token) return;

        try {
          await deleteCalendarEvent(token, task.calendarEventId);
          if (user?.isFirebase && db) {
            await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
              calendarEventId: null,
              syncedToCalendar: false,
              updatedAt: serverTimestamp()
            });
          }
          if (activeTab === 'calendar') {
            loadCalendarEvents();
          }
        } catch (err) {
          setError('Failed to delete event from Google Calendar: ' + err.message);
        }
      }
    });
  }

  // CONFIRMATION-GATED: Delete event directly from Calendar view
  function promptDeleteCalendarEvent(event) {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Google Calendar Event',
      message: `Are you sure you want to delete the event "${event.summary || 'Untitled'}" from your Google Calendar?`,
      confirmText: 'Delete Event',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        const token = await ensureCalendarAuth();
        if (!token) return;

        try {
          await deleteCalendarEvent(token, event.id);
          setCalendarEvents(prev => prev.filter(e => e.id !== event.id));
        } catch (err) {
          setError('Failed to delete calendar event: ' + err.message);
        }
      }
    });
  }

  // Save task (create or edit)
  async function save(e) {
    e.preventDefault();
    if (!title.trim() || !user) return;

    const trimmedTitle = title.trim();
    const trimmedSubject = subject.trim();

    if (user.isFirebase && ready && db) {
      const taskPath = `users/${user.uid}/tasks`;
      try {
        if (editing) {
          const docPath = `users/${user.uid}/tasks/${editing.id}`;
          const updatePayload = {
            title: trimmedTitle,
            subject: trimmedSubject,
            category,
            deadline: deadline || '',
            status: editing.status || 'pending',
            updatedAt: serverTimestamp()
          };
          await updateDoc(doc(db, 'users', user.uid, 'tasks', editing.id), updatePayload);
        } else {
          const createPayload = {
            title: trimmedTitle,
            subject: trimmedSubject,
            category,
            deadline: deadline || '',
            status: 'pending',
            syncedToCalendar: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          const newDocRef = await addDoc(collection(db, 'users', user.uid, 'tasks'), createPayload);

          // If user checked "Add to Google Calendar", trigger calendar creation
          if (syncToCalOnCreate) {
            const token = await ensureCalendarAuth();
            if (token) {
              const payload = taskToCalendarPayload({
                title: trimmedTitle,
                subject: trimmedSubject,
                category,
                deadline
              });
              const calEvent = await createCalendarEvent(token, payload);
              await updateDoc(doc(db, 'users', user.uid, 'tasks', newDocRef.id), {
                calendarEventId: calEvent.id,
                syncedToCalendar: true,
                updatedAt: serverTimestamp()
              });
            }
          }
        }

        setTitle('');
        setSubject('');
        setDeadline('');
        setSyncToCalOnCreate(false);
        setEditing(null);
        setError('');
      } catch (err) {
        setError(err.message);
        try {
          handleFirestoreError(
            err,
            editing ? OperationType.UPDATE : OperationType.CREATE,
            editing ? `users/${user.uid}/tasks/${editing.id}` : taskPath
          );
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      // Local storage mode
      if (editing) {
        const updated = tasks.map(t =>
          t.id === editing.id
            ? {
                ...t,
                title: trimmedTitle,
                subject: trimmedSubject,
                category,
                deadline: deadline || '',
                status: editing.status || 'pending',
                updatedAt: Date.now()
              }
            : t
        );
        persistLocalTasks(updated);
      } else {
        const newTask = {
          id: 'task-' + Date.now(),
          title: trimmedTitle,
          subject: trimmedSubject,
          category,
          deadline: deadline || '',
          status: 'pending',
          syncedToCalendar: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        persistLocalTasks([newTask, ...tasks]);
      }

      setTitle('');
      setSubject('');
      setDeadline('');
      setSyncToCalOnCreate(false);
      setEditing(null);
      setError('');
    }
  }

  async function toggle(t) {
    const nextStatus = t.status === 'completed' ? 'pending' : 'completed';
    if (user?.isFirebase && ready && db) {
      const docPath = `users/${user.uid}/tasks/${t.id}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'tasks', t.id), {
          status: nextStatus,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        setError(err.message);
        try {
          handleFirestoreError(err, OperationType.UPDATE, docPath);
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      const updated = tasks.map(item =>
        item.id === t.id ? { ...item, status: nextStatus, updatedAt: Date.now() } : item
      );
      persistLocalTasks(updated);
    }
  }

  function remove(t) {
    if (t.syncedToCalendar && t.calendarEventId) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Task & Calendar Event',
        message: `"${t.title}" is synced with Google Calendar. Deleting it will also remove the scheduled event from your calendar. Proceed?`,
        confirmText: 'Delete Everywhere',
        isDestructive: true,
        onConfirm: async () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          const token = getAccessToken();
          if (token && t.calendarEventId) {
            try {
              await deleteCalendarEvent(token, t.calendarEventId);
            } catch (err) {
              console.warn('Calendar event deletion non-fatal error:', err);
            }
          }
          if (user?.isFirebase && ready && db) {
            await deleteDoc(doc(db, 'users', user.uid, 'tasks', t.id));
          } else {
            persistLocalTasks(tasks.filter(item => item.id !== t.id));
          }
        }
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Delete Academic Task',
      message: `Are you sure you want to delete "${t.title}"?`,
      confirmText: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        if (user?.isFirebase && ready && db) {
          const docPath = `users/${user.uid}/tasks/${t.id}`;
          try {
            await deleteDoc(doc(db, 'users', user.uid, 'tasks', t.id));
          } catch (err) {
            setError(err.message);
            try {
              handleFirestoreError(err, OperationType.DELETE, docPath);
            } catch (e) {
              console.error(e);
            }
          }
        } else {
          const updated = tasks.filter(item => item.id !== t.id);
          persistLocalTasks(updated);
        }
      }
    });
  }

  function edit(t) {
    setEditing(t);
    setTitle(t.title);
    setSubject(t.subject || '');
    setCategory(t.category);
    setDeadline(t.deadline || '');
    setActiveTab('tasks');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function formatEventTime(event) {
    if (event.start?.dateTime) {
      const d = new Date(event.start.dateTime);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    if (event.start?.date) {
      return event.start.date + ' (All day)';
    }
    return 'Scheduled';
  }

  if (!user) {
    return (
      <main className="login">
        <div className="brand">
          <CheckCircle2 /> TaskMate <b>249</b>
        </div>
        <h1>
          Your academic life,
          <br />
          <em>under control.</em>
        </h1>
        <p>
          Keep assignments, practicals, class tasks and exams organized in one calm workspace with Firebase cloud synchronization and Google Calendar integration.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '24px' }}>
          <button
            className="g-btn"
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            style={{ width: '100%' }}
          >
            <svg viewBox="0 0 48 48" style={{ width: '18px', height: '18px' }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            <span>{isSigningIn ? 'Connecting...' : 'Sign in with Google'}</span>
          </button>

          <button onClick={handleGuestSignIn} style={{ justifyContent: 'center' }}>
            <ClipboardList /> Continue as Guest (Offline Preview)
          </button>
        </div>
        {error && <p className="error" style={{ marginTop: '14px' }}>{error}</p>}
      </main>
    );
  }

  return (
    <div className="app">
      {/* MANDATORY User Confirmation Modal for Mutating / Destructive Operations */}
      {confirmModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>
              {confirmModal.isDestructive ? (
                <AlertTriangle style={{ color: '#ef8290', width: '22px', height: '22px' }} />
              ) : (
                <CalendarDays style={{ color: 'var(--accent)', width: '22px', height: '22px' }} />
              )}
              {confirmModal.title}
            </h3>
            <p>{confirmModal.message}</p>
            <div className="actions">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button
                type="button"
                className={confirmModal.isDestructive ? 'danger' : 'primary'}
                style={{
                  background: confirmModal.isDestructive ? '#ef8290' : 'var(--accent)',
                  color: '#101629',
                  fontWeight: 700
                }}
                onClick={confirmModal.onConfirm}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Top Navigation & Profile Bar */}
      <div className="mobile-user-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {user.isFirebase ? <Cloud style={{ width: '14px', height: '14px', color: 'var(--accent)' }} /> : <User style={{ width: '14px', height: '14px' }} />}
          <span style={{ fontWeight: 600 }}>{user.displayName}</span>
        </div>
        <button
          onClick={handleSignOut}
          style={{ padding: '4px 8px', fontSize: '11px', border: '1px solid var(--line)', gap: '4px' }}
        >
          <LogOut style={{ width: '12px', height: '12px' }} /> Sign out
        </button>
      </div>

      <aside>
        <div className="brand">
          <CheckCircle2 /> TaskMate <b>249</b>
        </div>
        <p className="muted">PERSONAL WORKSPACE</p>

        <button
          className={activeTab === 'tasks' && filter === 'all' ? 'active' : ''}
          onClick={() => {
            setActiveTab('tasks');
            setFilter('all');
          }}
        >
          <ClipboardList /> All tasks
        </button>

        {cats.map(([id, label]) => (
          <button
            key={id}
            className={activeTab === 'tasks' && filter === id ? 'active' : ''}
            onClick={() => {
              setActiveTab('tasks');
              setFilter(id);
            }}
          >
            <BookOpen /> {label}
          </button>
        ))}

        <p className="muted" style={{ marginTop: '22px' }}>INTEGRATIONS</p>
        <button
          className={activeTab === 'calendar' ? 'active' : ''}
          onClick={() => setActiveTab('calendar')}
        >
          <CalendarDays /> Google Calendar
        </button>

        <div className="sidefoot">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            {user.isFirebase ? <Cloud style={{ width: '14px', height: '14px', color: 'var(--accent)' }} /> : <User style={{ width: '14px', height: '14px' }} />}
            <span style={{ fontWeight: 600 }}>{user.displayName}</span>
          </div>
          <small>{user.isFirebase ? 'Google Account' : 'Guest Mode'}</small>
          <button onClick={handleSignOut} style={{ marginTop: '10px' }}>
            <LogOut /> Sign out
          </button>
        </div>
      </aside>

      <section className="content">
        <header>
          <div>
            <small>YOUR WORKSPACE</small>
            <h1>{activeTab === 'calendar' ? 'Google Calendar' : 'Task dashboard'}</h1>
          </div>
          <button
            className="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
        </header>

        {/* Dashboard Stats */}
        <div className="stats">
          <article>
            <small>Total tasks</small>
            <strong>{stats.total}</strong>
          </article>
          <article>
            <small>Pending</small>
            <strong>{stats.pending}</strong>
          </article>
          <article>
            <small>On Calendar</small>
            <strong style={{ color: 'var(--accent)' }}>{stats.synced}</strong>
          </article>
        </div>

        {error && <p className="error" style={{ marginBottom: '16px' }}>{error}</p>}

        {/* VIEW 1: TASKS DASHBOARD */}
        {activeTab === 'tasks' && (
          <>
            <form className="composer" onSubmit={save}>
              <h2>{editing ? 'Edit task' : 'Add a task'}</h2>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Task title (e.g. Surveying practical)"
                maxLength={200}
                required
              />
              <div className="fields">
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  maxLength={100}
                />
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                >
                  {cats.map(([id, label]) => (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                />
              </div>

              {!editing && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: 'var(--muted)',
                    marginBottom: '10px',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={syncToCalOnCreate}
                    onChange={e => setSyncToCalOnCreate(e.target.checked)}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <span>Add as event to Google Calendar automatically</span>
                </label>
              )}

              <button className="primary">
                <Plus /> {editing ? 'Save changes' : 'Add task'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setTitle('');
                    setSubject('');
                    setDeadline('');
                  }}
                >
                  Cancel
                </button>
              )}
            </form>

            <div className="listhead">
              <h2>{filter === 'all' ? 'All tasks' : cats.find(c => c[0] === filter)?.[1]}</h2>
              <label>
                <Search />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search tasks"
                />
              </label>
            </div>

            <div className="tasks">
              {visible.map(t => (
                <article
                  className={'task ' + (t.status === 'completed' ? 'done' : '')}
                  key={t.id}
                >
                  <div className="task-main">
                    <button
                      className="check"
                      onClick={() => toggle(t)}
                      title={t.status === 'completed' ? 'Mark pending' : 'Mark completed'}
                    >
                      <CheckCircle2 />
                    </button>
                    <div className="taskbody">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong>{t.title}</strong>
                        {t.syncedToCalendar && (
                          <span className="badge cal" title="Scheduled on Google Calendar">
                            <CalendarDays style={{ width: '12px', height: '12px' }} /> On Calendar
                          </span>
                        )}
                      </div>
                      <small>
                        {t.subject || 'No subject'} · {cats.find(c => c[0] === t.category)?.[1]}{' '}
                        {t.deadline && '· Due ' + t.deadline}
                      </small>
                    </div>
                  </div>

                  <div className="task-actions">
                    {/* Explicit button to push specific task to connected Google Calendar */}
                    {t.syncedToCalendar ? (
                      <button
                        type="button"
                        className="cal-push-btn synced"
                        onClick={() => promptRemoveFromCalendar(t)}
                        title="Remove this event from Google Calendar"
                      >
                        <CalendarDays /> Synced to Calendar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cal-push-btn"
                        onClick={() => promptSyncTaskToCalendar(t)}
                        title="Push this task to your connected Google Calendar"
                      >
                        <CalendarDays /> Push to Calendar
                      </button>
                    )}

                    <button className="icon" onClick={() => edit(t)} title="Edit task">
                      <Edit3 />
                    </button>
                    <button
                      className="icon danger"
                      onClick={() => remove(t)}
                      title="Delete task"
                    >
                      <Trash2 />
                    </button>
                  </div>
                </article>
              ))}
              {!visible.length && (
                <p className="empty">No tasks found. Add your first task above.</p>
              )}
            </div>
          </>
        )}

        {/* VIEW 2: GOOGLE CALENDAR VIEW */}
        {activeTab === 'calendar' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div>
                <h2 style={{ margin: '0 0 6px', fontSize: '18px' }}>Google Calendar Events</h2>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
                  Live schedule from your primary Google Calendar account.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={loadCalendarEvents} disabled={loadingCalendar}>
                  <RefreshCw style={{ width: '15px', height: '15px', animation: loadingCalendar ? 'spin 1s linear infinite' : 'none' }} />
                  {loadingCalendar ? 'Refreshing...' : 'Refresh'}
                </button>
                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <button>
                    <ExternalLink style={{ width: '15px', height: '15px' }} /> Open Google Calendar
                  </button>
                </a>
              </div>
            </div>

            {!hasCalendarToken && (
              <div
                style={{
                  background: 'var(--panel)',
                  border: '1px dashed var(--accent)',
                  borderRadius: '16px',
                  padding: '28px',
                  textAlign: 'center'
                }}
              >
                <CalendarDays style={{ width: '40px', height: '40px', color: 'var(--accent)', margin: '0 auto 12px' }} />
                <h3>Connect Google Calendar</h3>
                <p style={{ color: 'var(--muted)', maxWidth: '440px', margin: '0 auto 20px', fontSize: '14px' }}>
                  Authorize access to view and manage your academic events and deadlines directly on your Google Calendar.
                </p>
                <button className="primary" onClick={ensureCalendarAuth} disabled={isSigningIn}>
                  <CalendarDays /> Authorize Calendar Access
                </button>
              </div>
            )}

            {hasCalendarToken && (
              <>
                {loadingCalendar && <p className="empty">Loading your calendar events...</p>}

                {!loadingCalendar && !calendarEvents.length && (
                  <p className="empty">No upcoming events found on your Google Calendar.</p>
                )}

                <div className="cal-grid">
                  {calendarEvents.map(event => (
                    <article className="cal-card" key={event.id}>
                      <div className="cal-card-head">
                        <div>
                          <strong>{event.summary || '(Untitled Event)'}</strong>
                          <div className="cal-time" style={{ marginTop: '4px' }}>
                            <CalendarDays style={{ width: '13px', height: '13px' }} />
                            {formatEventTime(event)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          {event.htmlLink && (
                            <a
                              href={event.htmlLink}
                              target="_blank"
                              rel="noreferrer"
                              title="View in Google Calendar"
                              style={{ color: 'inherit' }}
                            >
                              <button className="icon" type="button">
                                <ExternalLink style={{ width: '15px', height: '15px' }} />
                              </button>
                            </a>
                          )}
                          <button
                            className="icon danger"
                            type="button"
                            title="Delete event from Google Calendar"
                            onClick={() => promptDeleteCalendarEvent(event)}
                          >
                            <Trash2 style={{ width: '15px', height: '15px' }} />
                          </button>
                        </div>
                      </div>

                      {event.description && (
                        <p className="cal-desc">{event.description}</p>
                      )}
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}