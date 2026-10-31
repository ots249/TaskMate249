// Google Calendar API service
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary';

export async function fetchCalendarEvents(accessToken, { timeMin, maxResults = 25 } = {}) {
  if (!accessToken) throw new Error('No Google Calendar access token available');
  const now = timeMin || new Date().toISOString();
  const url = `${CALENDAR_API_BASE}/events?timeMin=${encodeURIComponent(now)}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Google Calendar API error (${res.status})`);
  }

  const data = await res.json();
  return data.items || [];
}

export async function createCalendarEvent(accessToken, eventData) {
  if (!accessToken) throw new Error('No Google Calendar access token available');

  const res = await fetch(`${CALENDAR_API_BASE}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventData)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Failed to create event (${res.status})`);
  }

  return await res.json();
}

export async function updateCalendarEvent(accessToken, eventId, eventData) {
  if (!accessToken) throw new Error('No Google Calendar access token available');

  const res = await fetch(`${CALENDAR_API_BASE}/events/${encodeURIComponent(eventId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(eventData)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Failed to update event (${res.status})`);
  }

  return await res.json();
}

export async function deleteCalendarEvent(accessToken, eventId) {
  if (!accessToken) throw new Error('No Google Calendar access token available');

  const res = await fetch(`${CALENDAR_API_BASE}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok && res.status !== 404) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Failed to delete event (${res.status})`);
  }

  return true;
}

// Converts a TaskMate task to Google Calendar event payload
export function taskToCalendarPayload(task) {
  const categoryLabel = task.category ? `[${task.category.toUpperCase()}] ` : '';
  const subjectLabel = task.subject ? ` (${task.subject})` : '';
  const summary = `${categoryLabel}${task.title}${subjectLabel}`;
  const description = `TaskMate 249 academic item\nSubject: ${task.subject || 'N/A'}\nCategory: ${task.category}\nStatus: ${task.status}`;

  // If deadline exists (YYYY-MM-DD), create all-day event
  if (task.deadline) {
    return {
      summary,
      description,
      start: { date: task.deadline },
      end: { date: task.deadline }
    };
  }

  // Fallback to today
  const today = new Date().toISOString().split('T')[0];
  return {
    summary,
    description,
    start: { date: today },
    end: { date: today }
  };
}
