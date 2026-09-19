import React, { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-toastify";
import {
  Search,
  SlidersHorizontal,
  Plus,
  MoreVertical,
  X,
  Loader2,
  PlayCircle,
  HelpCircle,
  FileText,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  UploadCloud,
  Pencil,
  Trash2,
  Eye,
  Inbox,
} from "lucide-react";
import "./TeacherContent.css";

// NOTE ON WIRING -----------------------------------------------------------
// This component assumes:
//   1. `contentService`, `categoryService`, `userService` are exported from
//      your api file (adjust the import path below to match your project).
//   2. The logged-in teacher's record is available in localStorage under
//      "user" as JSON, e.g. { id, name, ... }. Swap `getCurrentUser()` for
//      your real auth/context hook if you have one.
//   3. `userService.getFacultiesByUser(userId)` returns the teacher's
//      assigned faculties as an array of plain NAME STRINGS (matching how
//      `assignFaculty` writes them — `{ facult: [faculty] }`), not objects.
//      Those names are cross-referenced against `categoryService.getAll()`
//      to resolve real category records ({id, title, ...}), because every
//      other endpoint (content fetch, upload) needs a category id, not
//      just a name.
//   4. `contentService` has no bulk "getAll" endpoint, so this page fetches
//      content per assigned faculty (`getByCategoryId`) and merges the
//      results client-side. Swap for a single call if your backend adds one.
// ---------------------------------------------------------------------------
import { contentService, categoryService, userService } from "../../services/api";

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user")) || null;
  } catch {
    return null;
  }
};

// Normalizes whatever `getFacultiesByUser` returns into a flat list of
// lowercase-trimmed name strings, whether the API sends back plain strings
// ("Engineering"), or objects ({ title / name / faculty: "Engineering" }).
const extractFacultyName = (entry) => {
  if (typeof entry === "string") return entry;
  return entry?.title ?? entry?.name ?? entry?.faculty ?? "";
};

// Deterministic color palette so each faculty gets a stable, distinct badge.
const FACULTY_PALETTE = [
  { bg: "#E7EEFE", text: "#2554F0" }, // blue
  { bg: "#F1E9FE", text: "#7C3AED" }, // purple
  { bg: "#E4F8F1", text: "#0D9488" }, // teal
  { bg: "#FEF3E2", text: "#D97706" }, // amber
  { bg: "#FDE8EE", text: "#DB2777" }, // rose
];

const paletteFor = (label = "") => {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  return FACULTY_PALETTE[Math.abs(hash) % FACULTY_PALETTE.length];
};

const STATUS_STYLES = {
  PUBLISHED: { bg: "#DCFCE7", text: "#15803D", label: "Published" },
  DRAFT: { bg: "#E2E8F0", text: "#475569", label: "Draft" },
  PENDING: { bg: "#FEF3C7", text: "#B45309", label: "Pending" },
  REJECTED: { bg: "#FEE2E2", text: "#B91C1C", label: "Rejected" },
};

const TYPE_ICON = {
  video: { Icon: PlayCircle, bg: "#EEF2FF", text: "#4F46E5" },
  quiz: { Icon: HelpCircle, bg: "#F1E9FE", text: "#7C3AED" },
  document: { Icon: FileText, bg: "#E7F3FE", text: "#2563EB" },
  lecture: { Icon: Clapperboard, bg: "#FDE8EE", text: "#DB2777" },
  default: { Icon: FileText, bg: "#EEF1F6", text: "#475569" },
};

const PAGE_SIZE = 6;

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

export default function TeacherContent() {
  const user = useMemo(() => getCurrentUser(), []);

  const [faculties, setFaculties] = useState([]); // resolved category records: [{id, title, ...}]
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [search, setSearch] = useState("");
  const [facultyFilter, setFacultyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);

  const [showUploadModal, setShowUploadModal] = useState(false);

  // ---- Data loading ---------------------------------------------------
  const loadContent = useCallback(async () => {
    if (!user?.id) {
      setLoadError("You need to be signed in to view your content.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      // 1. Ask the backend which faculties this teacher is assigned to.
      //    This comes back as name strings (see extractFacultyName above),
      //    not full category objects.
      const facRes = await userService.getFacultiesByUser(user.id);
      const assignedNames = (facRes?.data ?? [])
        .map(extractFacultyName)
        .filter(Boolean)
        .map((n) => n.trim().toLowerCase());

      // 2. Pull the real category records so we have {id, title} to work
      //    with, then keep only the ones that match an assigned name.
      const catRes = await categoryService.getAll();
      const allCategories = catRes?.data ?? [];
      const assigned = allCategories.filter((c) =>
        assignedNames.includes((c.title ?? "").trim().toLowerCase())
      );

      setFaculties(assigned);

      if (assigned.length === 0) {
        setItems([]);
        return;
      }

      const results = await Promise.all(
        assigned.map((f) =>
          contentService
            .getByCategoryId(f.id)
            .then((r) => (Array.isArray(r?.data) ? r.data : r?.data?.content ?? []))
            .then((list) => list.map((c) => ({ ...c, facultyTitle: c.facultyTitle || f.title })))
            .catch(() => [])
        )
      );

      setItems(results.flat());
    } catch (err) {
      setLoadError(err?.response?.data?.message || "Couldn't load your content. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  // ---- Derived list -----------------------------------------------------
  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.title?.toLowerCase().includes(search.trim().toLowerCase());
      const matchesFaculty = facultyFilter === "all" || String(item.categoryId) === String(facultyFilter);
      const matchesStatus = statusFilter === "all" || (item.status || "PUBLISHED") === statusFilter;
      return matchesSearch && matchesFaculty && matchesStatus;
    });
  }, [items, search, facultyFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [search, facultyFilter, statusFilter]);

  // ---- Actions ------------------------------------------------------
  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    try {
      await contentService.remove(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Content deleted.");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't delete this item.");
    } finally {
      setOpenMenuId(null);
    }
  };

  const facultyNames = faculties.map((f) => f.title).join(", ");

  return (
    <div className="tc-page">
      <div className="tc-container">
        {/* Top bar */}
        <div className="tc-topbar">
          <div className="tc-search-wrap">
            <Search className="tc-search-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your lessons, files, or quizzes…"
              className="tc-search-input"
            />
          </div>
          <div className="tc-topbar-right">
            <div className="tc-user-badge">
              <GraduationCap className="tc-user-badge-icon" />
              <span className="tc-user-badge-name">{user?.name || "Teacher"}</span>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="tc-header">
          <div>
            <h1 className="tc-title">My Content</h1>
            <p className="tc-subtitle">Upload, edit, and manage lessons for the faculties you teach.</p>
          </div>
          <div className="tc-header-actions">
            <div className="tc-filter-wrap">
              <button onClick={() => setShowFilterMenu((v) => !v)} className="tc-filter-btn">
                <SlidersHorizontal className="tc-icon-sm" />
                Filter
              </button>
              {showFilterMenu && (
                <div className="tc-filter-menu">
                  <p className="tc-filter-menu-label">Status</p>
                  <div className="tc-chip-row tc-chip-row-spaced">
                    {["all", "PUBLISHED", "DRAFT", "PENDING"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`tc-chip ${statusFilter === s ? "tc-chip-active" : ""}`}
                      >
                        {s === "all" ? "All" : STATUS_STYLES[s]?.label ?? s}
                      </button>
                    ))}
                  </div>
                  <p className="tc-filter-menu-label">Faculty</p>
                  <div className="tc-chip-row">
                    <button
                      onClick={() => setFacultyFilter("all")}
                      className={`tc-chip ${facultyFilter === "all" ? "tc-chip-active" : ""}`}
                    >
                      All
                    </button>
                    {faculties.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setFacultyFilter(f.id)}
                        className={`tc-chip ${String(facultyFilter) === String(f.id) ? "tc-chip-active" : ""}`}
                      >
                        {f.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setShowUploadModal(true)} className="tc-upload-btn">
              <Plus className="tc-icon-sm" />
              Upload Content
            </button>
          </div>
        </div>

        {/* Scope banner */}
        <div className="tc-banner">
          <GraduationCap className="tc-banner-icon" />
          <p className="tc-banner-text">
            You can upload content for your assigned faculties:{" "}
            <span className="tc-banner-highlight">{facultyNames || "No faculties assigned yet"}</span>.
          </p>
        </div>

        {/* Table card */}
        <div className="tc-card">
          {loading ? (
            <div className="tc-state">
              <Loader2 className="tc-spinner" />
              <p className="tc-state-text">Loading your content…</p>
            </div>
          ) : loadError ? (
            <div className="tc-state">
              <p className="tc-state-error">{loadError}</p>
              <button onClick={loadContent} className="tc-retry-btn">
                Try again
              </button>
            </div>
          ) : paginated.length === 0 ? (
            <div className="tc-state">
              <div className="tc-empty-icon-wrap">
                <Inbox className="tc-empty-icon" />
              </div>
              <p className="tc-state-title">No content matches your filters</p>
              <p className="tc-state-muted">Try a different search, or upload something new.</p>
            </div>
          ) : (
            <>
              <div className="tc-table-wrap">
                <table className="tc-table">
                  <thead>
                    <tr className="tc-thead-row">
                      <th className="tc-th tc-th-title">Title</th>
                      <th className="tc-th">Faculty</th>
                      <th className="tc-th">Date</th>
                      <th className="tc-th">Files</th>
                      <th className="tc-th">Views</th>
                      <th className="tc-th">Status</th>
                      <th className="tc-th tc-th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((item) => {
                      const type = TYPE_ICON[item.type] || TYPE_ICON.default;
                      const status = STATUS_STYLES[item.status || "PUBLISHED"] || STATUS_STYLES.DRAFT;
                      const faculty = paletteFor(item.facultyTitle);
                      const Icon = type.Icon;
                      return (
                        <tr key={item.id} className="tc-tr">
                          <td className="tc-td tc-td-title">
                            <div className="tc-item-row">
                              <div className="tc-item-icon" style={{ backgroundColor: type.bg }}>
                                <Icon className="tc-item-icon-glyph" style={{ color: type.text }} />
                              </div>
                              <div>
                                <p className="tc-item-title">{item.title}</p>
                                {item.description && <p className="tc-item-desc">{item.description}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="tc-td">
                            <span className="tc-badge" style={{ backgroundColor: faculty.bg, color: faculty.text }}>
                              {item.facultyTitle || "—"}
                            </span>
                          </td>
                          <td className="tc-td tc-td-muted">{formatDate(item.createdAt || item.date)}</td>
                          <td className="tc-td tc-td-muted">
                            {String(item.fileCount ?? (item.fileName ? 1 : 0)).padStart(2, "0")}
                          </td>
                          <td className="tc-td tc-td-muted">
                            {item.views != null ? item.views.toLocaleString() : "—"}
                          </td>
                          <td className="tc-td">
                            <span
                              className="tc-status-badge"
                              style={{ backgroundColor: status.bg, color: status.text }}
                            >
                              {status.label}
                            </span>
                          </td>
                          <td className="tc-td tc-td-actions">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                              className="tc-actions-btn"
                            >
                              <MoreVertical className="tc-icon-sm" />
                            </button>
                            {openMenuId === item.id && (
                              <div className="tc-menu">
                                <button className="tc-menu-item">
                                  <Eye className="tc-icon-xs" /> View
                                </button>
                                <button className="tc-menu-item">
                                  <Pencil className="tc-icon-xs" /> Edit
                                </button>
                                <button onClick={() => handleDelete(item)} className="tc-menu-item tc-menu-item-danger">
                                  <Trash2 className="tc-icon-xs" /> Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="tc-pagination">
                <p className="tc-page-info">
                  Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                  {filtered.length} posts
                </p>
                <div className="tc-page-controls">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="tc-page-nav-btn"
                  >
                    <ChevronLeft className="tc-icon-sm" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .slice(0, 5)
                    .map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`tc-page-btn ${p === page ? "tc-page-btn-active" : ""}`}
                      >
                        {p}
                      </button>
                    ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="tc-page-nav-btn"
                  >
                    <ChevronRight className="tc-icon-sm" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showUploadModal && (
        <UploadModal
          faculties={faculties}
          user={user}
          onClose={() => setShowUploadModal(false)}
          onUploaded={(created) => {
            setItems((prev) => [created, ...prev]);
            setShowUploadModal(false);
          }}
        />
      )}
    </div>
  );
}

function UploadModal({ faculties, user, onClose, onUploaded }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(faculties[0]?.id ?? "");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !categoryId) {
      setError("Title and faculty are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data: created } = await contentService.create(user.id, categoryId, {
        title: title.trim(),
        description: description.trim(),
      });

      if (file && created?.id) {
        const formData = new FormData();
        formData.append("file", file);
        await contentService.uploadFile(created.id, formData);
      }

      const faculty = faculties.find((f) => String(f.id) === String(categoryId));
      toast.success("Content uploaded.");
      onUploaded({
        ...created,
        facultyTitle: faculty?.title,
        categoryId,
        status: created?.status || "DRAFT",
        fileCount: file ? 1 : 0,
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Upload failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tc-modal-overlay">
      <div className="tc-modal">
        <div className="tc-modal-header">
          <h2 className="tc-modal-title">Upload content</h2>
          <button onClick={onClose} className="tc-modal-close">
            <X className="tc-icon-sm" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="tc-modal-form">
          <div className="tc-field">
            <label className="tc-field-label">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Fluid Mechanics"
              className="tc-input"
            />
          </div>

          <div className="tc-field">
            <label className="tc-field-label">Faculty</label>
            {faculties.length === 0 ? (
              <p className="tc-state-error" style={{ margin: 0 }}>
                No faculties are assigned to your account yet — ask an admin to assign one before uploading.
              </p>
            ) : (
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="tc-select">
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="tc-field">
            <label className="tc-field-label">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Short summary students will see"
              className="tc-textarea"
            />
          </div>

          <div className="tc-field">
            <label className="tc-field-label">File</label>
            <label className="tc-dropzone">
              <UploadCloud className="tc-dropzone-icon" />
              <span className="tc-dropzone-text">{file ? file.name : "Click to choose a file"}</span>
              <input type="file" className="tc-hidden-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          {error && <p className="tc-state-error tc-field-error">{error}</p>}

          <div className="tc-modal-footer">
            <button type="button" onClick={onClose} className="tc-btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting || faculties.length === 0} className="tc-btn-primary">
              {submitting && <Loader2 className="tc-icon-sm tc-spin" />}
              {submitting ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
