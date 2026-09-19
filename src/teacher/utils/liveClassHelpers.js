/**
 * liveClassHelpers.js
 * -------------------------------------------------------------------------
 * Same responsibility split as examHelpers.js:
 *  - normalize teacher faculties / categories / live classes
 *  - match teacher faculty names -> category IDs (source of truth for access)
 *  - build the create/update payload
 *  - derive UPCOMING / LIVE / PAST status
 *
 * ⚠️ No live-class DTO sample was confirmed. normalizeTeacherFaculties()
 * below tries several common response shapes (bare array, {faculties:[]},
 * {facult:[]} — note your own assignFaculty() method uses "facult" not
 * "faculty", so your GET endpoint may use the same key). If your page
 * still shows "No faculties assigned", check the console.debug output
 * this file prints and adjust the shape-matching block accordingly.
 * -------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Faculty / category normalization
// ---------------------------------------------------------------------------

/**
 * Accepts whatever userService.getFacultiesByUser(userId) returned as
 * response.data and tries every shape we've seen in this project:
 *   ["math", "science"]
 *   [{ name: "math" }, { faculty: "science" }]
 *   { faculties: ["math", "science"] }
 *   { facult: ["math", "science"] }        <- matches assignFaculty()'s key
 *   { data: [...] }
 */
export function normalizeTeacherFaculties(raw) {
  if (!raw) {
    console.debug("[liveClassHelpers] normalizeTeacherFaculties received falsy raw value:", raw);
    return [];
  }

  let list;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (Array.isArray(raw?.faculties)) {
    list = raw.faculties;
  } else if (Array.isArray(raw?.facult)) {
    list = raw.facult;
  } else if (Array.isArray(raw?.data)) {
    list = raw.data;
  } else {
    console.warn(
      "[liveClassHelpers] Could not find a faculty array inside the response. " +
        "Raw response was:",
      raw,
      "— open this object in devtools and tell me the actual key name so I can fix normalizeTeacherFaculties()."
    );
    list = [];
  }

  const out = [];
  const seen = new Set();

  list.forEach((item) => {
    let name = "";
    let id = null;

    if (typeof item === "string") {
      name = item;
    } else if (item && typeof item === "object") {
      name = item.name ?? item.faculty ?? item.facult ?? item.facultyName ?? item.title ?? "";
      id = item.id ?? item.facultyId ?? item.categoryId ?? null;
    }

    const key = name.trim().toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push({ id, name });
    }
  });

  console.debug("[liveClassHelpers] normalizeTeacherFaculties ->", out);
  return out;
}

export function normalizeCategories(raw) {
  const list = Array.isArray(raw) ? raw : raw?.data ?? [];
  const out = list.map((c) => ({
    id: c.categoryId ?? c.id,
    title: c.categoryTitle ?? c.title ?? c.name ?? "",
    mainCategory: c.mainCategory ?? c.title ?? c.name ?? "",
  }));
  console.debug("[liveClassHelpers] normalizeCategories ->", out);
  return out;
}

function slugify(value) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

/** SOURCE OF TRUTH for which categories this teacher may view/create/edit/delete in. */
export function getAllowedCategories(teacherFaculties, allCategories) {
  const facultyNames = new Set(teacherFaculties.map((f) => slugify(f.name)));
  const directIds = new Set(teacherFaculties.filter((f) => f.id != null).map((f) => String(f.id)));

  const allowed = allCategories.filter((cat) => {
    if (directIds.has(String(cat.id))) return true;
    return facultyNames.has(slugify(cat.title)) || facultyNames.has(slugify(cat.mainCategory));
  });

  const seen = new Set();
  const deduped = allowed.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  if (teacherFaculties.length > 0 && deduped.length === 0) {
    console.warn(
      "[liveClassHelpers] Teacher has faculties but none matched a category by name.",
      "\nTeacher faculties:", teacherFaculties,
      "\nAll categories:", allCategories,
      "\nCheck for a spelling/casing mismatch between the two, or that the faculty",
      "objects carry a usable id (id/facultyId/categoryId)."
    );
  }

  return deduped;
}

/** Security guard — call before every create/update/delete/start action. */
export function isTeacherFaculty(categoryId, allowedCategories) {
  return allowedCategories.some((c) => String(c.id) === String(categoryId));
}

// ---------------------------------------------------------------------------
// Date parsing (Spring Boot LocalDateTime can serialize as an array)
// ---------------------------------------------------------------------------

export function parseBackendDate(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [y, mo = 1, d = 1, h = 0, mi = 0, s = 0] = value;
    return new Date(y, mo - 1, d, h, mi, s);
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Live class normalization + derived status
// ---------------------------------------------------------------------------

export function deriveLiveStatus(live) {
  const now = new Date();
  const start = parseBackendDate(live.startTime ?? live.date);
  let end = parseBackendDate(live.endTime);
  if (!end && start && live.duration) {
    end = new Date(start.getTime() + Number(live.duration) * 60000);
  }

  if (!start) return "UPCOMING";
  if (end && now > end) return "PAST";
  if (now >= start) return "LIVE";
  return "UPCOMING";
}

/** Normalize a raw live-class record from getByCategoryId() */
export function normalizeLiveClass(raw, categoryMeta) {
  return {
    id: raw.id ?? raw.liveId ?? raw.liveClassId,
    title: raw.title ?? raw.sessionTitle ?? raw.name ?? "Untitled Session",
    description: raw.description ?? "",
    startTime: raw.startTime ?? raw.date ?? null,
    endTime: raw.endTime ?? null,
    duration: raw.duration ?? null, // minutes — NOTE: field name guessed
    meetingUrl: raw.meetingUrl ?? raw.liveUrl ?? raw.link ?? raw.url ?? null, // NOTE: guessed
    categoryId: raw.categoryId ?? categoryMeta?.id ?? null,
    facultyName: categoryMeta?.title ?? raw.categoryTitle ?? raw.facultyName ?? "Unknown",
    teacherName: raw.teacherName ?? raw.instructorName ?? raw.userName ?? null, // NOTE: guessed
    enrolled: raw.enrolled ?? raw.totalEnrolled ?? raw.enrollment ?? null,
    joined: raw.joined ?? raw.attendeesCount ?? raw.joinedCount ?? null,
    attendance: raw.attendance ?? raw.attendancePercent ?? null,
    status: deriveLiveStatus(raw),
    raw,
  };
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

function toIsoLocal(dateStr, timeStr) {
  if (!dateStr) return null;
  const time = timeStr || "00:00";
  return `${dateStr}T${time}:00.000`;
}

/**
 * ⚠️ ADJUST field names here once the real backend DTO is confirmed.
 */
export function buildLiveClassPayload(formState) {
  return {
    title: formState.title.trim(),
    description: formState.description?.trim() || undefined,
    startTime: toIsoLocal(formState.date, formState.time),
    duration: formState.duration ? Number(formState.duration) : undefined,
    meetingUrl: formState.meetingUrl?.trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// Formatting + display helpers
// ---------------------------------------------------------------------------

export function formatDate(value) {
  const d = parseBackendDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatTime(value) {
  const d = parseBackendDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function isToday(value) {
  const d = parseBackendDate(value);
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function statusBadgeClass(status) {
  switch (status) {
    case "LIVE":
      return "lcm-badge lcm-badge--live";
    case "PAST":
      return "lcm-badge lcm-badge--past";
    case "UPCOMING":
    default:
      return "lcm-badge lcm-badge--upcoming";
  }
}

/**
 * Reads the logged-in user id from localStorage, trying every key we've
 * seen used across this project (id, userId, _id) and, in case "user" is
 * itself wrapped (e.g. { user: {...} }), one level of nesting too.
 */
export function getStoredUserId() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem("user"));
  } catch {
    console.warn("[liveClassHelpers] localStorage 'user' is not valid JSON.");
    return null;
  }
  if (!stored) {
    console.warn("[liveClassHelpers] No 'user' found in localStorage.");
    return null;
  }

  const id =
    stored?.id ??
    stored?.userId ??
    stored?._id ??
    stored?.user?.id ??
    stored?.user?.userId ??
    null;

  console.debug("[liveClassHelpers] localStorage user object:", stored, "-> resolved userId:", id);
  return id;
}
