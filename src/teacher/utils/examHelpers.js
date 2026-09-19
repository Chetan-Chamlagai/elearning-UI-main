/**
 * examHelpers.js
 * -------------------------------------------------------------------------
 * Central place for:
 *  - normalizing faculties/categories/exams returned by the backend
 *  - matching a teacher's assigned faculties against available categories
 *  - building the exam create/update payload (ONLY real backend fields)
 *  - deriving a display status since the backend does not return one
 *
 * KNOWN BACKEND EXAM DTO (confirmed from Postman):
 *   {
 *     title: string,
 *     deadline: string | null,      // ISO date-time, purpose not confirmed
 *     startTime: "YYYY-MM-DDTHH:mm:ss.SSS",
 *     endTime: "YYYY-MM-DDTHH:mm:ss.SSS",
 *     examType: "EXAM" | ...        // other enum values NOT confirmed
 *   }
 *
 * IMPORTANT: description, duration, totalMarks, passingMarks, status,
 * numberOfQuestions and the questions array are NOT part of the confirmed
 * DTO. The UI still collects them (per design spec) but they are kept
 * OUT of buildExamPayload() until the real DTO fields are confirmed.
 * Search for "NOTE:" below wherever an assumption was made.
 * -------------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Faculty / category normalization
// ---------------------------------------------------------------------------

/**
 * userService.getFacultiesByUser(userId) may return:
 *   ["Computer Science", "Information Technology"]
 * or:
 *   [{ name: "Computer Science", id: 1 }, ...]
 * Normalize to: [{ id, name }]  (id may be null if backend only sent a string)
 */
export function normalizeTeacherFaculties(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw?.data ?? [];

  return list
    .map((item) => {
      if (typeof item === "string") {
        return { id: null, name: item };
      }
      if (item && typeof item === "object") {
        // NOTE: field names guessed (name/facultyName/title, id/facultyId)
        const name = item.name ?? item.facultyName ?? item.title ?? item.categoryTitle ?? "";
        const id = item.id ?? item.facultyId ?? item.categoryId ?? null;
        return { id, name };
      }
      return null;
    })
    .filter((f) => f && f.name);
}

/** categoryService.getAll() -> normalize to [{ id, title, mainCategory }] */
export function normalizeCategories(raw) {
  const list = Array.isArray(raw) ? raw : raw?.data ?? [];
  return list.map((c) => ({
    id: c.categoryId ?? c.id,
    title: c.categoryTitle ?? c.title ?? c.name ?? "",
    mainCategory: c.mainCategory ?? c.title ?? c.name ?? "",
  }));
}

/**
 * Normalize a name for comparison: lowercase, trim, and collapse any
 * hyphens/underscores/extra whitespace so "Class-12_math", "class 12 math"
 * and "class_12_math" are all treated as the same faculty. This prevents
 * a teacher from seeing an unrelated faculty just because of formatting
 * differences between what the faculty API and category API return.
 */
function slugify(value) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Match the teacher's faculty names against real categories to get the
 * category IDs the teacher is actually allowed to create/manage exams for.
 * This is the SOURCE OF TRUTH for faculty-based access control on the frontend.
 */
export function getAllowedCategories(teacherFaculties, allCategories) {
  const facultyNames = new Set(teacherFaculties.map((f) => slugify(f.name)));

  // If backend already gave us IDs directly on the faculty objects, prefer those.
  const directIds = new Set(
    teacherFaculties.filter((f) => f.id != null).map((f) => f.id)
  );

  return allCategories.filter((cat) => {
    if (directIds.has(cat.id)) return true;
    const title = slugify(cat.title);
    const main = slugify(cat.mainCategory);
    return facultyNames.has(title) || facultyNames.has(main);
  });
}

/** Security guard — call this before every create/update/delete submission. */
export function isTeacherFaculty(categoryId, allowedCategories) {
  return allowedCategories.some((c) => String(c.id) === String(categoryId));
}

// ---------------------------------------------------------------------------
// Exam normalization + derived status
// ---------------------------------------------------------------------------

/**
 * Spring Boot LocalDateTime sometimes serializes as an array
 * [yyyy, MM, dd, HH, mm, ss] instead of an ISO string. Handle both.
 */
export function parseBackendDate(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const [y, mo = 1, d = 1, h = 0, mi = 0, s = 0] = value;
    return new Date(y, mo - 1, d, h, mi, s);
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Backend has no explicit exam status field in the confirmed DTO, so we
 * derive DRAFT / SCHEDULED / LIVE / CLOSED from startTime/endTime.
 * NOTE: if the backend DOES return a `status` field on GET, we use it directly.
 */
export function deriveExamStatus(exam) {
  if (exam.status) return String(exam.status).toUpperCase();

  const now = new Date();
  const start = parseBackendDate(exam.startTime);
  const end = parseBackendDate(exam.endTime);

  if (!start) return "DRAFT";
  if (start > now) return "SCHEDULED";
  if (end && end < now) return "CLOSED";
  return "LIVE";
}

/** Normalize a raw exam record from getAll() / getByCategory() */
export function normalizeExam(raw, categoryMeta) {
  return {
    id: raw.examId ?? raw.id,
    title: raw.title ?? "",
    // NOTE: description is NOT in the confirmed DTO — shown only if backend happens to return it
    description: raw.description ?? "",
    deadline: raw.deadline ?? null,
    startTime: raw.startTime ?? null,
    endTime: raw.endTime ?? null,
    examType: raw.examType ?? "EXAM",
    categoryId: raw.categoryId ?? categoryMeta?.id ?? null,
    facultyName: categoryMeta?.title ?? raw.categoryTitle ?? raw.facultyName ?? "Unknown",
    fileName: raw.fileName ?? raw.file ?? null,
    status: deriveExamStatus(raw),
    // UI-only fields, may be undefined if backend never sends them:
    duration: raw.duration ?? null,
    totalMarks: raw.totalMarks ?? null,
    passingMarks: raw.passingMarks ?? null,
    numberOfQuestions: raw.numberOfQuestions ?? null,
    attempts: raw.attempts ?? null, // NOTE: no submissions API given — will stay null
    avgScore: raw.avgScore ?? null, // NOTE: same as above
    raw,
  };
}

// ---------------------------------------------------------------------------
// Payload builder — kept isolated so it's easy to adjust to the real DTO
// ---------------------------------------------------------------------------

function toIsoLocal(dateStr, timeStr) {
  if (!dateStr) return null;
  const time = timeStr || "00:00";
  // Matches the confirmed sample format: 2024-10-30T09:00:00.000
  return `${dateStr}T${time}:00.000`;
}

/**
 * Builds the payload for examService.create()/update().
 * ONLY includes fields confirmed to exist on the backend DTO.
 * `formState` is the raw create-exam-modal form state.
 */
export function buildExamPayload(formState) {
  return {
    title: formState.title.trim(),
    deadline: formState.deadlineDate
      ? toIsoLocal(formState.deadlineDate, formState.deadlineTime)
      : null,
    startTime: toIsoLocal(formState.startDate, formState.startTime),
    endTime: toIsoLocal(formState.endDate, formState.endTime),
    examType: formState.examType || "EXAM",
    // -----------------------------------------------------------------
    // ⚠️ ADJUST HERE once the real Spring Boot Exam DTO is confirmed.
    // The fields below are collected in the UI but NOT sent because they
    // are not present in the sample payload you shared:
    //   description, duration, totalMarks, passingMarks, status, questions
    // -----------------------------------------------------------------
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
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

export function statusBadgeClass(status) {
  switch (status) {
    case "LIVE":
      return "em-badge em-badge--live";
    case "SCHEDULED":
      return "em-badge em-badge--scheduled";
    case "CLOSED":
      return "em-badge em-badge--closed";
    case "DRAFT":
    default:
      return "em-badge em-badge--draft";
  }
}
