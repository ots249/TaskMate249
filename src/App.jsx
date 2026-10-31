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
import { auth, db, provider, ready } from './firebase';
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
  User
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
    createdAt: Date.now() - 3600000 * 24
  },
  {
    id: 'demo-2',
    title: 'Fluid Mechanics Problem Set 4',
    subject: 'ME 201',
    category: 'assignment',
    deadline: '2026-11-08',
    status: 'pending',
    createdAt: Date.now() - 3600000 * 12
  },
  {
    id: 'demo-3',
    title: 'Structural Analysis Midterm Exam',
    subject: 'CE 205',
    category: 'exam',
    deadline: '2026-11-15',
    status: 'pending',
    createdAt: Date.now() - 3600000 * 48
  },
  {
    id: 'demo-4',
    title: 'Engineering Ethics Case Study Presentation',
    subject: 'HUM 111',
    category: 'class-task',
    deadline: '2026-10-30',
    status: 'completed',
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

  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('assignment');
  const [deadline, setDeadline] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [theme, setTheme] = useState(() => localStorage.getItem('tm-theme') || 'dark');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  // Apply theme to document
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tm-theme', theme);
  }, [theme]);

  // Firebase Auth listener (when configured)
  useEffect(() => {
    if (!ready || !auth) return;
    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      if (firebaseUser) {
        const userData = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Student',
          email: firebaseUser.email,
          isFirebase: true
        };
        setUser(userData);
        localStorage.setItem('tm-user', JSON.stringify(userData));
      } else if (user?.isFirebase) {
        setUser(null);
        localStorage.removeItem('tm-user');
      }
    });
    return unsubscribe;
  }, [user?.isFirebase]);

  // Task listener: Firestore if real Firebase, localStorage if local/demo
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    if (user.isFirebase && ready && db) {
      return onSnapshot(
        query(collection(db, 'users', user.uid, 'tasks'), orderBy('createdAt', 'desc')),
        snapshot => {
          setTasks(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
        },
        err => setError(err.message)
      );
    }

    // Local / In-memory storage fallback
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

  const stats = useMemo(
    () => ({
      total: tasks.length,
      done: tasks.filter(t => t.status === 'completed').length,
      pending: tasks.filter(t => t.status !== 'completed').length
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
    if (!ready || !auth) {
      setError('Firebase credentials are not configured yet. You can continue as Guest / Demo.');
      return;
    }
    setError('');
    try {
      const result = await signInWithPopup(auth, provider);
      const userData = {
        uid: result.user.uid,
        displayName: result.user.displayName || 'Student',
        email: result.user.email,
        isFirebase: true
      };
      setUser(userData);
      localStorage.setItem('tm-user', JSON.stringify(userData));
    } catch (err) {
      setError(err.message);
    }
  }

  function handleGuestSignIn() {
    setError('');
    const guestUser = {
      uid: 'demo-student-249',
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
    setUser(null);
    localStorage.removeItem('tm-user');
    setTasks([]);
  }

  async function save(e) {
    e.preventDefault();
    if (!title.trim() || !user) return;

    const data = {
      title: title.trim(),
      subject: subject.trim(),
      category,
      deadline: deadline || '',
      status: editing?.status || 'pending',
      updatedAt: user.isFirebase ? serverTimestamp() : Date.now()
    };

    try {
      if (user.isFirebase && ready && db) {
        if (editing) {
          await updateDoc(doc(db, 'users', user.uid, 'tasks', editing.id), data);
        } else {
          await addDoc(collection(db, 'users', user.uid, 'tasks'), {
            ...data,
            createdAt: serverTimestamp()
          });
        }
      } else {
        // Local mode update/create
        if (editing) {
          const updated = tasks.map(t =>
            t.id === editing.id ? { ...t, ...data, updatedAt: Date.now() } : t
          );
          persistLocalTasks(updated);
        } else {
          const newTask = {
            id: 'task-' + Date.now(),
            ...data,
            createdAt: Date.now()
          };
          persistLocalTasks([newTask, ...tasks]);
        }
      }

      setTitle('');
      setSubject('');
      setDeadline('');
      setEditing(null);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggle(t) {
    const nextStatus = t.status === 'completed' ? 'pending' : 'completed';
    try {
      if (user?.isFirebase && ready && db) {
        await updateDoc(doc(db, 'users', user.uid, 'tasks', t.id), {
          status: nextStatus,
          updatedAt: serverTimestamp()
        });
      } else {
        const updated = tasks.map(item =>
          item.id === t.id ? { ...item, status: nextStatus, updatedAt: Date.now() } : item
        );
        persistLocalTasks(updated);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(t) {
    try {
      if (user?.isFirebase && ready && db) {
        await deleteDoc(doc(db, 'users', user.uid, 'tasks', t.id));
      } else {
        const updated = tasks.filter(item => item.id !== t.id);
        persistLocalTasks(updated);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  function edit(t) {
    setEditing(t);
    setTitle(t.title);
    setSubject(t.subject || '');
    setCategory(t.category);
    setDeadline(t.deadline || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          Keep assignments, practicals, class tasks and exams organized in one calm workspace.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '22px' }}>
          <button className="primary" onClick={handleGuestSignIn} style={{ justifyContent: 'center' }}>
            <ClipboardList /> Continue to Workspace
          </button>
          {ready ? (
            <button onClick={handleGoogleSignIn} style={{ justifyContent: 'center' }}>
              <User /> Continue with Google
            </button>
          ) : (
            <small style={{ marginTop: '8px', opacity: 0.8 }}>
              Local workspace mode is active. Configure Firebase environment variables for cloud sync.
            </small>
          )}
        </div>
        {error && <p className="error" style={{ marginTop: '14px' }}>{error}</p>}
      </main>
    );
  }

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <CheckCircle2 /> TaskMate <b>249</b>
        </div>
        <p className="muted">PERSONAL WORKSPACE</p>
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          <ClipboardList /> All tasks
        </button>
        {cats.map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            onClick={() => setFilter(id)}
          >
            <BookOpen /> {label}
          </button>
        ))}
        <div className="sidefoot">
          {user.displayName}
          <button onClick={handleSignOut}>
            <LogOut /> Sign out
          </button>
        </div>
      </aside>

      <section className="content">
        <header>
          <div>
            <small>YOUR WORKSPACE</small>
            <h1>Task dashboard</h1>
          </div>
          <button
            className="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
        </header>

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
            <small>Completed</small>
            <strong>{stats.done}</strong>
          </article>
        </div>

        <form className="composer" onSubmit={save}>
          <h2>{editing ? 'Edit task' : 'Add a task'}</h2>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title (e.g. Surveying practical)"
            required
          />
          <div className="fields">
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Subject (optional)"
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

        {error && <p className="error">{error}</p>}

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
              <button
                className="check"
                onClick={() => toggle(t)}
                title={t.status === 'completed' ? 'Mark pending' : 'Mark completed'}
              >
                <CheckCircle2 />
              </button>
              <div className="taskbody">
                <strong>{t.title}</strong>
                <small>
                  {t.subject || 'No subject'} · {cats.find(c => c[0] === t.category)?.[1]}{' '}
                  {t.deadline && '· ' + t.deadline}
                </small>
              </div>
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
            </article>
          ))}
          {!visible.length && (
            <p className="empty">No tasks found. Add your first task above.</p>
          )}
        </div>
      </section>
    </div>
  );
}