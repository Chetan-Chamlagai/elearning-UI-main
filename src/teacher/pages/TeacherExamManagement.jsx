import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Star, Search, Eye, Pencil, Trash2, FileText } from "lucide-react";
import { toast } from "react-toastify";
import { examService, userService, categoryService } from "../../services/api"; // ADJUST PATH to your project
import {
  normalizeTeacherFaculties,
  normalizeCategories,
  getAllowedCategories,
  normalizeExam,
  formatDate,
  formatTime,
  statusBadgeClass,
} from "../utils/examHelpers";
import ExamFormModal from "../../teacher/components/ExamFormModal";
import ExamDetailsModal from "../../teacher/components/ExamDetailsModal";
import "./TeacherExamManagement.css";

/**
 * TeacherExamManagement
 * ---------------------------------------------------------------------
 * Faculty restriction — source of truth:
 *   1. userService.getFacultiesByUser(userId)  -> teacher's OWN faculties
 *   2. categoryService.getAll()                -> all categories in system
 *   3. getAllowedCategories(...)                -> INTERSECTION of the two
 *      This intersection ("allowedCategories") is the only thing ever
 *      passed to the create/edit form's faculty dropdown, and the only
 *      thing the exam list is filtered against. A teacher can never see
 *      or select a faculty that isn't in this list.
 *
 * Exam fetching:
 *   examService.getByCategory(categoryId) — the REAL, existing endpoint
 *   (GET /exams/{categoryId}) — is called ONCE PER allowed faculty
 *   (Promise.allSettled so one failing faculty doesn't break the page).
 *   We never call examService.getAll() and filter client-side, so a
 *   teacher's browser never even receives another faculty's exam data.
 * ---------------------------------------------------------------------
 */
export default function TeacherExamManagement() {
  const [userId, setUserId] = useState(null);
  const [noUser, setNoUser] = useState(false);

  const [allowedCategories, setAllowedCategories] = useState([]);
  const [facultyLoading, setFacultyLoading] = useState(true);

  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(true);

  const [selectedFaculty, setSelectedFaculty] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [viewingExam, setViewingExam] = useState(null);
  const [deletingExam, setDeletingExam] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ---- Step 1: resolve logged-in teacher ----
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("user"));
      const id = stored?.id ?? stored?.userId;
      if (!id) {
        setNoUser(true);
        setFacultyLoading(false);
        setExamsLoading(false);
        return;
      }
      setUserId(id);
    } catch {
      setNoUser(true);
      setFacultyLoading(false);
      setExamsLoading(false);
    }
  }, []);

  // ---- Step 2: teacher's own faculties -> intersect with real categories ----
  const loadFaculties = useCallback(async () => {
    if (!userId) return;
    setFacultyLoading(true);
    try {
      const [facultyRes, categoryRes] = await Promise.all([
        userService.getFacultiesByUser(userId),
        categoryService.getAll(),
      ]);

      const teacherFaculties = normalizeTeacherFaculties(facultyRes?.data);
      const allCategories = normalizeCategories(categoryRes?.data);
      let allowed = getAllowedCategories(teacherFaculties, allCategories);

      // Defensive dedupe by category id — in case the backend has duplicate
      // category rows with the same title, we still only want each real
      // category (by id) to appear once in the dropdown/filter.
      const seen = new Set();
      allowed = allowed.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

      if (teacherFaculties.length > 0 && allowed.length === 0) {
        // Faculties exist but none matched a real category — surfacing this
        // helps catch backend name-mismatch issues early instead of silently
        // showing an empty dropdown.
        console.warn(
          "[TeacherExamManagement] Teacher faculties did not match any category:",
          teacherFaculties,
          allCategories
        );
      }

      setAllowedCategories(allowed);
    } catch {
      toast.error("Failed to load your faculties.");
    } finally {
      setFacultyLoading(false);
    }
  }, [userId]);

  // ---- Step 3: exams — one call per allowed faculty, teacher-scoped ----
  const loadExams = useCallback(async () => {
    if (!userId || allowedCategories.length === 0) {
      setExams([]);
      setExamsLoading(false);
      return;
    }
    setExamsLoading(true);
    try {
      const results = await Promise.allSettled(
        allowedCategories.map((cat) => examService.getByCategory(cat.id))
      );

      const merged = [];
      results.forEach((res, idx) => {
        const cat = allowedCategories[idx];
        if (res.status === "fulfilled") {
          const list = Array.isArray(res.value?.data) ? res.value.data : [];
          list.forEach((raw) => merged.push(normalizeExam(raw, cat)));
        }
      });

      setExams(merged);

      if (results.some((r) => r.status === "rejected")) {
        toast.error("Some exams could not be loaded for one or more faculties.");
      }
    } catch {
      toast.error("Failed to load exams.");
    } finally {
      setExamsLoading(false);
    }
  }, [userId, allowedCategories]);

  useEffect(() => {
    loadFaculties();
  }, [loadFaculties]);

  useEffect(() => {
    if (!facultyLoading) loadExams();
  }, [facultyLoading, loadExams]);

  // ---- derived: filtered exam list ----
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      const matchesFaculty =
        selectedFaculty === "all" || String(exam.categoryId) === String(selectedFaculty);
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        exam.title.toLowerCase().includes(term) ||
        exam.facultyName.toLowerCase().includes(term) ||
        exam.status.toLowerCase().includes(term);
      return matchesFaculty && matchesSearch;
    });
  }, [exams, selectedFaculty, searchTerm]);

  // ---- derived: summary stats (computed, never hard-coded) ----
  const stats = useMemo(() => {
    const total = exams.length;
    const live = exams.filter((e) => e.status === "LIVE").length;
    const draft = exams.filter((e) => e.status === "DRAFT").length;
    const closed = exams.filter((e) => e.status === "CLOSED").length;
    return { total, live, draft, closed };
  }, [exams]);

  const openCreate = () => {
    if (allowedCategories.length === 0) {
      toast.error("You have no assigned faculties yet.");
      return;
    }
    setEditingExam(null);
    setShowFormModal(true);
  };

  const openEdit = (exam) => {
    // Extra guard: never allow editing an exam whose faculty isn't the teacher's own.
    if (!allowedCategories.some((c) => String(c.id) === String(exam.categoryId))) {
      toast.error("You can only manage exams for your assigned faculties.");
      return;
    }
    setEditingExam(exam);
    setShowFormModal(true);
  };

  const confirmDelete = async () => {
    if (!deletingExam) return;
    if (!allowedCategories.some((c) => String(c.id) === String(deletingExam.categoryId))) {
      toast.error("You can only delete exams for your assigned faculties.");
      setDeletingExam(null);
      return;
    }
    setDeleting(true);
    try {
      await examService.remove(deletingExam.id);
      toast.success("Exam deleted successfully.");
      setDeletingExam(null);
      loadExams();
    } catch {
      toast.error("Failed to delete exam.");
    } finally {
      setDeleting(false);
    }
  };

  if (noUser) {
    return (
      <div className="em-page">
        <div className="em-empty-state">
          <FileText size={32} />
          <h3>You're not logged in</h3>
          <p>Please log in again to manage your exams.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="em-page">
      {/* Header */}
      <div className="em-header">
        <div>
          <h1>Exam Management</h1>
          <p>Create, manage and publish assessments for your assigned faculties.</p>
        </div>
        <div className="em-header-actions">
          <button className="em-btn-secondary" onClick={() => toast.info("Grade Submissions is coming soon.")}>
            <Star size={16} /> Grade Submissions
          </button>
          <button className="em-btn-primary" onClick={openCreate}>
            <Plus size={16} /> Create New Exam
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="em-stats">
        <StatCard label="Total Exams" value={stats.total} loading={examsLoading} />
        <StatCard label="Live" value={stats.live} loading={examsLoading} />
        <StatCard label="Drafts" value={stats.draft} loading={examsLoading} />
        <StatCard label="Closed" value={stats.closed} loading={examsLoading} />
      </div>

      {/* Filters */}
      <div className="em-filters">
        <div className="em-search">
          <Search size={16} />
          <input
            placeholder="Search exams by title, faculty or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select value={selectedFaculty} onChange={(e) => setSelectedFaculty(e.target.value)}>
          <option value="all">All Faculties</option>
          {allowedCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state: no faculties assigned */}
      {!facultyLoading && allowedCategories.length === 0 && (
        <div className="em-empty-state">
          <FileText size={32} />
          <h3>No faculties assigned yet</h3>
          <p>Once faculties are assigned to your account, you'll be able to create exams here.</p>
        </div>
      )}

      {/* Table */}
      {(facultyLoading || allowedCategories.length > 0) && (
        <div className="em-table-card">
          {examsLoading || facultyLoading ? (
            <TableSkeleton />
          ) : filteredExams.length === 0 ? (
            <div className="em-empty-state">
              <FileText size={32} />
              <h3>No exams found</h3>
              <p>
                {exams.length === 0
                  ? "You haven't created any exams yet."
                  : "No exams match your search or filter."}
              </p>
            </div>
          ) : (
            <div className="em-table-scroll">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Exam Title</th>
                    <th>Faculty</th>
                    <th>Status</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Attempts</th>
                    <th>Avg. Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.map((exam) => (
                    <tr key={exam.id}>
                      <td data-label="Exam Title" className="em-title-cell">
                        {exam.title}
                      </td>
                      <td data-label="Faculty">{exam.facultyName}</td>
                      <td data-label="Status">
                        <span className={statusBadgeClass(exam.status)}>{exam.status}</span>
                      </td>
                      <td data-label="Start">
                        {formatDate(exam.startTime)} {formatTime(exam.startTime)}
                      </td>
                      <td data-label="End">
                        {formatDate(exam.endTime)} {formatTime(exam.endTime)}
                      </td>
                      <td data-label="Attempts">{exam.attempts ?? "N/A"}</td>
                      <td data-label="Avg. Score">{exam.avgScore ?? "N/A"}</td>
                      <td data-label="Actions" className="em-actions-cell">
                        <button title="View" onClick={() => setViewingExam(exam)}>
                          <Eye size={16} />
                        </button>
                        <button title="Edit" onClick={() => openEdit(exam)}>
                          <Pencil size={16} />
                        </button>
                        <button title="Delete" className="em-danger" onClick={() => setDeletingExam(exam)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit modal — only ever receives this teacher's own faculties */}
      {showFormModal && (
        <ExamFormModal
          userId={userId}
          allowedCategories={allowedCategories}
          editingExam={editingExam}
          onClose={() => setShowFormModal(false)}
          onSaved={loadExams}
        />
      )}

      {/* View modal */}
      {viewingExam && <ExamDetailsModal exam={viewingExam} onClose={() => setViewingExam(null)} />}

      {/* Delete confirmation */}
      {deletingExam && (
        <div className="em-overlay">
          <div className="em-confirm-modal">
            <h3>Delete exam?</h3>
            <p>
              Are you sure you want to delete <strong>{deletingExam.title}</strong>? This action cannot be undone.
            </p>
            <div className="em-confirm-actions">
              <button className="em-btn-secondary" onClick={() => setDeletingExam(null)} disabled={deleting}>
                Cancel
              </button>
              <button className="em-btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, loading }) {
  return (
    <div className="em-stat-card">
      <span className="em-stat-label">{label}</span>
      <span className="em-stat-value">{loading ? "—" : value}</span>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="em-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="em-skeleton-row" />
      ))}
    </div>
  );
}
