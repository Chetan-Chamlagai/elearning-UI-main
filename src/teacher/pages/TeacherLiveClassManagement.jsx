import { useCallback, useEffect, useMemo, useState } from "react";
import { Video, Users, Timer, Calendar, Search } from "lucide-react";
import { toast } from "react-toastify";
import { liveClassService, userService, categoryService } from "../../services/api"; // ADJUST PATH
import {
  normalizeTeacherFaculties,
  normalizeCategories,
  getAllowedCategories,
  normalizeLiveClass,
  isToday,
  formatDate,
  formatTime,
  getStoredUserId,
} from "../utils/liveClassHelpers";
import CreateLiveClassModal from "../components/CreateLiveClassModal";
import LiveClassCard from "../components/LiveClassCard";
import LiveClassDetailsModal from "../components/LiveClassDetailsModal";
import "./TeacherLiveClassManagement.css";

/**
 * TeacherLiveClassManagement
 * ---------------------------------------------------------------------
 * If you're seeing "No faculties assigned" but you know the teacher DOES
 * have faculties, open devtools -> Console. This file and
 * liveClassHelpers.js log every raw API response and the normalized
 * result at each step:
 *   [liveClassHelpers] localStorage user object: ... -> resolved userId: ...
 *   [TeacherLiveClassManagement] raw getFacultiesByUser response: ...
 *   [liveClassHelpers] normalizeTeacherFaculties -> [...]
 *   [liveClassHelpers] normalizeCategories -> [...]
 *   [liveClassHelpers] Teacher has faculties but none matched a category...
 * Whichever line shows an empty/wrong result tells you exactly which
 * shape assumption is wrong — fix that one spot in liveClassHelpers.js.
 * ---------------------------------------------------------------------
 */
export default function TeacherLiveClassManagement() {
  const [userId, setUserId] = useState(null);
  const [noUser, setNoUser] = useState(false);

  const [allowedCategories, setAllowedCategories] = useState([]);
  const [facultyLoading, setFacultyLoading] = useState(true);

  const [liveClasses, setLiveClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);

  const [selectedFaculty, setSelectedFaculty] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [editingClass, setEditingClass] = useState(null);
  const [viewingClass, setViewingClass] = useState(null);
  const [deletingClass, setDeletingClass] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ---- Step 1: resolve logged-in teacher ----
  useEffect(() => {
    const id = getStoredUserId();
    if (!id) {
      toast.error("You must be logged in to manage live classes.");
      setNoUser(true);
      setFacultyLoading(false);
      setClassesLoading(false);
      return;
    }
    setUserId(id);
  }, []);

  // ---- Step 2: teacher's faculties -> intersect with real categories ----
  const loadFaculties = useCallback(async () => {
    if (!userId) return;
    setFacultyLoading(true);
    try {
      const [facultyRes, categoryRes] = await Promise.all([
        userService.getFacultiesByUser(userId),
        categoryService.getAll(),
      ]);

      console.debug("[TeacherLiveClassManagement] raw getFacultiesByUser response:", facultyRes?.data);
      console.debug("[TeacherLiveClassManagement] raw categoryService.getAll response:", categoryRes?.data);

      const teacherFaculties = normalizeTeacherFaculties(facultyRes?.data);
      const allCategories = normalizeCategories(categoryRes?.data);
      const allowed = getAllowedCategories(teacherFaculties, allCategories);

      setAllowedCategories(allowed);
    } catch (err) {
      console.error("[TeacherLiveClassManagement] loadFaculties failed:", err);
      toast.error("Failed to load your faculties.");
    } finally {
      setFacultyLoading(false);
    }
  }, [userId]);

  // ---- Step 3: live classes — one call per allowed faculty ----
  const loadLiveClasses = useCallback(async () => {
    if (!userId || allowedCategories.length === 0) {
      setLiveClasses([]);
      setClassesLoading(false);
      return;
    }
    setClassesLoading(true);
    try {
      const results = await Promise.allSettled(
        allowedCategories.map((cat) => liveClassService.getByCategoryId(cat.id))
      );

      const merged = [];
      results.forEach((res, idx) => {
        const cat = allowedCategories[idx];
        if (res.status === "fulfilled") {
          const list = Array.isArray(res.value?.data) ? res.value.data : [];
          list.forEach((raw) => merged.push(normalizeLiveClass(raw, cat)));
        } else {
          console.error(
            `[TeacherLiveClassManagement] getByCategoryId(${cat.id}) failed:`,
            res.reason
          );
        }
      });

      setLiveClasses(merged);

      if (results.some((r) => r.status === "rejected")) {
        toast.error("Some sessions could not be loaded for one or more faculties.");
      }
    } catch (err) {
      console.error("[TeacherLiveClassManagement] loadLiveClasses failed:", err);
      toast.error("Failed to load live classes.");
    } finally {
      setClassesLoading(false);
    }
  }, [userId, allowedCategories]);

  useEffect(() => {
    loadFaculties();
  }, [loadFaculties]);

  useEffect(() => {
    if (!facultyLoading) loadLiveClasses();
  }, [facultyLoading, loadLiveClasses]);

  // ---- derived: filtered list (faculty filter + search), scoped data only ----
  const filteredClasses = useMemo(() => {
    return liveClasses.filter((lc) => {
      const matchesFaculty =
        selectedFaculty === "all" || String(lc.categoryId) === String(selectedFaculty);
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        lc.title.toLowerCase().includes(term) ||
        (lc.description || "").toLowerCase().includes(term) ||
        lc.facultyName.toLowerCase().includes(term);
      return matchesFaculty && matchesSearch;
    });
  }, [liveClasses, selectedFaculty, searchTerm]);

  const upcoming = useMemo(
    () =>
      filteredClasses
        .filter((lc) => lc.status === "UPCOMING" || lc.status === "LIVE")
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    [filteredClasses]
  );

  const past = useMemo(
    () =>
      filteredClasses
        .filter((lc) => lc.status === "PAST")
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime)),
    [filteredClasses]
  );

  // ---- derived: stats — computed only from real fetched data ----
  const stats = useMemo(() => {
    const scheduledToday = liveClasses.filter((lc) => isToday(lc.startTime)).length;

    const durations = liveClasses.map((lc) => lc.duration).filter((d) => d != null && !isNaN(d));
    const teachingHours =
      durations.length > 0
        ? (durations.reduce((sum, d) => sum + Number(d), 0) / 60).toFixed(1)
        : null;

    const enrollments = liveClasses.map((lc) => lc.enrolled).filter((e) => e != null && !isNaN(e));
    const totalEnrolled =
      enrollments.length > 0 ? enrollments.reduce((sum, e) => sum + Number(e), 0) : null;

    return { scheduledToday, teachingHours, totalEnrolled };
  }, [liveClasses]);

  const handleStart = (lc) => {
    if (lc.meetingUrl) {
      window.open(lc.meetingUrl, "_blank", "noopener,noreferrer");
    } else {
      toast.info("No meeting link is set for this session yet. Use Manage to add one.");
    }
  };

  const openEdit = (lc) => {
    if (!allowedCategories.some((c) => String(c.id) === String(lc.categoryId))) {
      toast.error("You can only manage sessions for your assigned faculties.");
      return;
    }
    setEditingClass(lc);
  };

  const confirmDelete = async () => {
    if (!deletingClass) return;
    if (!allowedCategories.some((c) => String(c.id) === String(deletingClass.categoryId))) {
      toast.error("You can only delete sessions for your assigned faculties.");
      setDeletingClass(null);
      return;
    }
    setDeleting(true);
    try {
      await liveClassService.remove(deletingClass.id);
      toast.success("Live class deleted successfully.");
      setDeletingClass(null);
      loadLiveClasses();
    } catch (err) {
      console.error("[TeacherLiveClassManagement] delete failed:", err);
      toast.error("Failed to delete live class.");
    } finally {
      setDeleting(false);
    }
  };

  if (noUser) {
    return (
      <div className="lcm-page">
        <div className="lcm-empty-state">
          <Video size={32} />
          <h3>You're not logged in</h3>
          <p>Please log in again to manage live classes.</p>
        </div>
      </div>
    );
  }

  const showCreateForm = !facultyLoading && allowedCategories.length > 0;

  return (
    <div className="lcm-page">
      <div className="lcm-header-row">
        <div>
          <h1>Live Class Management</h1>
          <p>Schedule, manage, and launch your synchronous learning sessions.</p>
        </div>
        <button className="lcm-btn-secondary" onClick={() => toast.info("Calendar view is coming soon.")}>
          <Calendar size={16} /> Calendar View
        </button>
      </div>

      <div className="lcm-search-filter-row">
        <div className="lcm-search">
          <Search size={16} />
          <input
            placeholder="Search sessions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select value={selectedFaculty} onChange={(e) => setSelectedFaculty(e.target.value)}>
          <option value="all">All My Faculties</option>
          {allowedCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <div className="lcm-main-grid">
        {/* Left: inline create form */}
        <div className="lcm-left-col">
          {facultyLoading ? (
            <div className="lcm-card-skeleton" style={{ height: 420 }} />
          ) : showCreateForm ? (
            <CreateLiveClassModal
              userId={userId}
              allowedCategories={allowedCategories}
              editingClass={null}
              onSaved={loadLiveClasses}
            />
          ) : (
            <div className="lcm-empty-state">
              <Video size={28} />
              <h3>No faculties assigned</h3>
              <p>No faculties assigned to your account.</p>
            </div>
          )}
        </div>

        {/* Right: stats + sessions */}
        <div className="lcm-right-col">
          <div className="lcm-stats">
            <StatCard
              icon={<Video size={20} />}
              label="Scheduled Today"
              value={facultyLoading || classesLoading ? "—" : `${stats.scheduledToday} Sessions`}
              tint="blue"
            />
            <StatCard
              icon={<Users size={20} />}
              label="Total Enrolled"
              value={
                facultyLoading || classesLoading
                  ? "—"
                  : stats.totalEnrolled != null
                  ? `${stats.totalEnrolled} Students`
                  : "N/A"
              }
              tint="purple"
            />
            <StatCard
              icon={<Timer size={20} />}
              label="Teaching Hours"
              value={
                facultyLoading || classesLoading
                  ? "—"
                  : stats.teachingHours != null
                  ? `${stats.teachingHours} hrs`
                  : "N/A"
              }
              tint="teal"
            />
          </div>

          <section className="lcm-section">
            <h2>Upcoming Sessions</h2>

            {facultyLoading || classesLoading ? (
              <CardSkeleton />
            ) : allowedCategories.length === 0 ? null : upcoming.length === 0 ? (
              <div className="lcm-empty-state">
                <Video size={28} />
                <h3>No upcoming sessions</h3>
                <p>
                  {liveClasses.length === 0
                    ? selectedFaculty === "all"
                      ? "No live classes found for your assigned faculties."
                      : "No live classes found for this faculty."
                    : "No upcoming sessions match your search or filter."}
                </p>
              </div>
            ) : (
              <div className="lcm-upcoming-grid">
                {upcoming.map((lc, idx) => (
                  <LiveClassCard
                    key={lc.id}
                    liveClass={lc}
                    highlight={idx === 0}
                    onStart={handleStart}
                    onManage={openEdit}
                    onView={setViewingClass}
                    onDelete={setDeletingClass}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="lcm-section">
            <div className="lcm-section-header">
              <h2>Past Live Sessions</h2>
            </div>

            {facultyLoading || classesLoading ? (
              <TableSkeleton />
            ) : past.length === 0 ? (
              <div className="lcm-empty-state">
                <Video size={28} />
                <h3>No past sessions</h3>
                <p>Completed sessions will show up here.</p>
              </div>
            ) : (
              <div className="lcm-table-card">
                <table className="lcm-table">
                  <thead>
                    <tr>
                      <th>Session Title &amp; Faculty</th>
                      <th>Date &amp; Duration</th>
                      <th>Attendance</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {past.map((lc) => (
                      <tr key={lc.id}>
                        <td>
                          <strong>{lc.title}</strong>
                          <div className="lcm-table-sub">{lc.facultyName}</div>
                        </td>
                        <td>
                          {formatDate(lc.startTime)} · {formatTime(lc.startTime)}
                          <div className="lcm-table-sub">
                            {lc.duration ? `${lc.duration} mins` : "N/A"}
                          </div>
                        </td>
                        <td>{lc.attendance != null ? `${lc.attendance}%` : "N/A"}</td>
                        <td className="lcm-table-actions">
                          <button title="View" onClick={() => setViewingClass(lc)}>
                            View
                          </button>
                          <button
                            title="Delete"
                            className="lcm-danger"
                            onClick={() => setDeletingClass(lc)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Edit modal — teacher-owned categories only */}
      {editingClass && (
        <CreateLiveClassModal
          userId={userId}
          allowedCategories={allowedCategories}
          editingClass={editingClass}
          onClose={() => setEditingClass(null)}
          onSaved={loadLiveClasses}
        />
      )}

      {/* View modal */}
      {viewingClass && (
        <LiveClassDetailsModal liveClass={viewingClass} onClose={() => setViewingClass(null)} />
      )}

      {/* Delete confirmation */}
      {deletingClass && (
        <div className="lcm-overlay">
          <div className="lcm-confirm-modal">
            <h3>Delete live class?</h3>
            <p>
              Are you sure you want to delete <strong>{deletingClass.title}</strong>? This action
              cannot be undone.
            </p>
            <div className="lcm-confirm-actions">
              <button
                className="lcm-btn-secondary"
                onClick={() => setDeletingClass(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button className="lcm-btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, tint }) {
  return (
    <div className={`lcm-stat-card lcm-stat-card--${tint}`}>
      <div className="lcm-stat-icon">{icon}</div>
      <div>
        <span className="lcm-stat-label">{label}</span>
        <span className="lcm-stat-value">{value}</span>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="lcm-upcoming-grid">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="lcm-card-skeleton" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="lcm-table-card">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="lcm-row-skeleton" />
      ))}
    </div>
  );
}
