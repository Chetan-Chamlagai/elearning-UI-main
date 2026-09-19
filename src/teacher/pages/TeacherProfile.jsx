// teacher/pages/TeacherProfile.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "react-toastify";
import {
  User as UserIcon,
  Camera,
  Pencil,
  GraduationCap,
} from "lucide-react";

import { userService, authService } from "../../services/api"; // adjust path to match your actual services/api.js location
// authService is expected to expose:
//   updatePassword: (data) => api.post("/auth/update-password", data)
//   forgotPassword: (data) => api.post("/auth/forgetpw", data)
import { ErrorState } from "../components/StateViews"; // adjust if the teacher panel keeps state-view components elsewhere

import "./TeacherProfile.css";

/* ============================================================
 * Config / helpers
 * ============================================================ */

// NOTE: same host your api.js baseURL points at (elp.mytufan.com/api/v1),
// minus the /api/v1 suffix — used to resolve relative image paths from
// the backend. If you already have a shared BASE_URL/config constant
// elsewhere in the project, import that instead of redefining it here.
const API_ROOT = "https://elp.mytufan.com/api/v1";
const FILE_BASE = API_ROOT.replace(/\/api\/v1\/?$/, "");

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_FILE_SIZE_MB = 5;

/**
 * Reads the logged-in user's id.
 * Tries the `"user"` object (per this task's spec) first, then falls
 * back to a flat `"userId"` key (the pattern used elsewhere in this
 * project's student/admin panels) in case teacher auth uses that instead.
 */
const getLoggedInUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user"));
    if (user?.id) return user.id;
  } catch {
    // "user" key missing or not valid JSON — fall through to the flat key
  }
  return localStorage.getItem("userId") || null;
};

/**
 * role / roles[0] can come back as a plain string ("TEACHER") or as an
 * object ({ id, name }) depending on the endpoint — always resolve to
 * a plain string so it's safe to render directly. This is what was
 * crashing the page: an { id, name } role object was being rendered
 * straight into a <span>.
 */
const normalizeRole = (raw) => {
  const roleValue = raw.role ?? raw.roles?.[0] ?? raw.userRole;
  if (!roleValue) return "Teacher";
  if (typeof roleValue === "string") return roleValue;
  return roleValue.name || roleValue.roleName || roleValue.title || "Teacher";
};

/**
 * NOTE: the exact field name for the profile image on GET /users/{id}
 * hasn't been confirmed — this covers the likely candidates. Check the
 * real response and trim this list once you know the real field.
 */
const normalizeProfile = (raw) => {
  if (!raw) return null;
  return {
   id: raw.id ?? raw.userId,
fullName:
  raw.fullName ||
  raw.name ||
  ([raw.firstName, raw.lastName].filter(Boolean).join(" ") || "Unnamed Teacher"),
    email: raw.email ?? "N/A",
    phone: raw.phone ?? raw.phoneNumber ?? raw.mobile ?? "N/A",
    username: raw.username ?? raw.userName ?? null,
    // NOTE: confirmed via the real update-profile payload ({ collegename,
    // name, email }) — GET may return it under a differently-cased key,
    // so cover the likely variants.
    collegeName: raw.collegename ?? raw.collegeName ?? raw.college ?? "",
    role: normalizeRole(raw),
    status:
      raw.status ??
      raw.accountStatus ??
      (raw.active === false ? "Inactive" : raw.active === true ? "Active" : null),
    image: raw.profileImage ?? raw.image ?? raw.imageUrl ?? raw.profilePicture ?? null,
  };
};

const normalizeFaculties = (data) => {
  if (!Array.isArray(data)) return [];

  return data.map((faculty) => {
    if (typeof faculty === "string") {
      return {
        id: faculty,
        name: faculty,
      };
    }

    return {
      id: faculty?.id,
      name:
        faculty?.name ||
        faculty?.facultyName ||
        faculty?.title ||
        "Unnamed Faculty",
    };
  });
};


const resolveImageUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${FILE_BASE}${cleanPath}`;
};

const validateImageFile = (file) => {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Please select a JPG, PNG, or WEBP image.";
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `Image must be smaller than ${MAX_FILE_SIZE_MB}MB.`;
  }
  return null;
};

/* ============================================================
 * Profile header — avatar, name, change-photo flow
 * ============================================================ */
const ProfileHeader = ({
  profile,
  previewUrl,
  selectedFile,
  uploading,
  onFileSelect,
  onUploadConfirm,
  onCancelSelection,
  fileInputRef,
}) => {
  const [imgError, setImgError] = useState(false);
  const resolvedImage = resolveImageUrl(profile?.image);

  const initials = (profile?.fullName || "")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <section className="tp-header">
      <div className="tp-header__avatar-wrap">
        {previewUrl ? (
          <img src={previewUrl} alt="Selected preview" className="tp-header__avatar" />
        ) : resolvedImage && !imgError ? (
          <img
            src={resolvedImage}
            alt={profile?.fullName}
            className="tp-header__avatar"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="tp-header__avatar tp-header__avatar--fallback">
            {initials || <UserIcon size={32} />}
          </div>
        )}
      </div>

      <h2 className="tp-header__name">{profile?.fullName}</h2>
      <p className="tp-header__email">{profile?.email}</p>
      <span className="tp-header__role-badge">{profile?.role}</span>

      {!selectedFile ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={onFileSelect}
            hidden
          />
          <button className="tp-header__change-btn" onClick={() => fileInputRef.current?.click()}>
            <Camera size={15} /> Change Photo
          </button>
        </>
      ) : (
        <div className="tp-header__preview-actions">
          <button className="tp-header__upload-btn" onClick={onUploadConfirm} disabled={uploading}>
            {uploading ? "Uploading..." : "Upload Photo"}
          </button>
          <button className="tp-header__cancel-btn" onClick={onCancelSelection} disabled={uploading}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
};

/* ============================================================
 * Personal information — view / edit
 * ============================================================ */
const PersonalInfoCard = ({ profile, isEditing, onEdit, onCancelEdit, onSave, saving }) => {
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? "",
    phone: profile?.phone ?? "",
    email: profile?.email ?? "",
    collegeName: profile?.collegeName ?? "",
  });

  useEffect(() => {
    setForm({
      fullName: profile?.fullName ?? "",
      phone: profile?.phone ?? "",
      email: profile?.email ?? "",
      collegeName: profile?.collegeName ?? "",
    });
  }, [profile, isEditing]);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  return (
    <div className="tp-card">
      <div className="tp-card__header">
        <h3>Personal Information</h3>
        {!isEditing && (
          <button className="tp-card__edit-btn" onClick={onEdit}>
            <Pencil size={14} /> Edit Profile
          </button>
        )}
      </div>

      {isEditing ? (
        <form
          className="tp-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(form);
          }}
        >
          <label>
            Full Name
            <input name="fullName" value={form.fullName} onChange={handleChange} required />
          </label>
          <label>
            {/* NOTE: the confirmed update-profile payload is
                { collegename, name, email } — phone isn't part of it,
                so this field is shown for reference but not submitted. */}
            Phone
            <input name="phone" value={form.phone} onChange={handleChange} disabled />
          </label>
          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={handleChange} required />
          </label>
          <label>
            College Name
            <input name="collegeName" value={form.collegeName} onChange={handleChange} />
          </label>

          <div className="tp-edit-form__actions">
            <button type="submit" className="tp-btn tp-btn--primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="tp-btn tp-btn--ghost"
              onClick={onCancelEdit}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <ul className="tp-info-list">
          <li>
            <span>Full Name</span>
            <strong>{profile?.fullName}</strong>
          </li>
          <li>
            <span>Email</span>
            <strong>{profile?.email}</strong>
          </li>
          <li>
            <span>Phone</span>
            <strong>{profile?.phone}</strong>
          </li>
          {profile?.username && (
            <li>
              <span>Username</span>
              <strong>{profile.username}</strong>
            </li>
          )}
          {profile?.collegeName && (
            <li>
              <span>College</span>
              <strong>{profile.collegeName}</strong>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

/* ============================================================
 * Faculties
 * ============================================================ */
const FacultiesCard = ({ faculties }) => (
  <div className="tp-card">
    <div className="tp-card__header">
      <h3>Assigned Faculties</h3>
    </div>

    {faculties.length ? (
      <ul className="tp-faculty-list">
        {faculties.map((faculty, index) => (
          <li
            key={faculty.id ?? index}
            className="tp-faculty-chip"
          >
            <GraduationCap size={14} />
            <span>{faculty.name}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="tp-empty-note">
        No faculties assigned yet.
      </p>
    )}
  </div>
);

/* ============================================================
 * Account info
 * ============================================================ */
const AccountInfoCard = ({ profile }) => (
  <div className="tp-card">
    <div className="tp-card__header">
      <h3>Account Information</h3>
    </div>
    <ul className="tp-info-list">
      <li>
        <span>User ID</span>
        <strong>{profile?.id}</strong>
      </li>
      <li>
        <span>Role</span>
        <strong>{profile?.role}</strong>
      </li>
      {profile?.status && (
        <li>
          <span>Status</span>
          <strong>{profile.status}</strong>
        </li>
      )}
    </ul>
  </div>
);

/* ============================================================
 * Security — OTP-based password change
 *
 * Real flow confirmed from the backend:
 *   1. POST /auth/forgetpw     { phnum }                       → sends OTP
 *   2. POST /auth/update-password { phnum, otp, newPassword }  → sets it
 * There's no "current password" check — it's phone + OTP verification.
 * ============================================================ */
const RESEND_COOLDOWN_SECONDS = 30;

const SecurityCard = ({ profile }) => {
  const [phone, setPhone] = useState(
    profile?.phone && profile.phone !== "N/A" ? profile.phone : ""
  );
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [changing, setChanging] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      toast.error("Enter your registered phone number first.");
      return;
    }

    setSendingOtp(true);
    try {
      await authService.forgotPassword({ phnum: phone.trim() });
      toast.success("OTP sent to your phone number.");
      setOtpSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Failed to send OTP. Check the phone number and try again."
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (!otp.trim()) {
      toast.error("Enter the OTP sent to your phone.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirm password don't match.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }

    setChanging(true);
    try {
      await authService.updatePassword({
        phnum: phone.trim(),
        otp: otp.trim(),
        newPassword,
      });
      toast.success("Password changed successfully.");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setOtpSent(false);
      setCooldown(0);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to change password. Check the OTP and try again."
      );
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="tp-card">
      <div className="tp-card__header">
        <h3>Security</h3>
      </div>

      <div className="tp-otp-step">
        <label>
          Phone Number
          <div className="tp-otp-inline">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98XXXXXXXX"
              disabled={otpSent}
            />
            <button
              type="button"
              className="tp-btn tp-btn--outline"
              onClick={handleSendOtp}
              disabled={sendingOtp || cooldown > 0}
            >
              {sendingOtp
                ? "Sending..."
                : cooldown > 0
                ? `Resend in ${cooldown}s`
                : otpSent
                ? "Resend OTP"
                : "Send OTP"}
            </button>
          </div>
        </label>
      </div>

      {otpSent && (
        <form className="tp-edit-form" onSubmit={handleChangePassword}>
          <label>
            OTP
            <input value={otp} onChange={(e) => setOtp(e.target.value)} required />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          <div className="tp-edit-form__actions">
            <button type="submit" className="tp-btn tp-btn--primary" disabled={changing}>
              {changing ? "Changing..." : "Change Password"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

/* ============================================================
 * Page
 * ============================================================ */

/**
 * TeacherProfile
 * Loads the logged-in teacher's profile (GET /users/{id}) and assigned
 * faculties (GET /users/{id}/faculties), and lets them change their
 * photo (POST /users/file/upload/{id}), edit personal info, and change
 * their password.
 *
 * NOTE: userService.update(id, data, config) is your real PUT /users/{id}
 * method — Edit Profile sends only { name, email, collegename } through
 * it, matching the confirmed backend payload.
 */
const TeacherProfile = () => {
  const userId = useMemo(getLoggedInUserId, []);
  const fileInputRef = useRef(null);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState(null);
  const [faculties, setFaculties] = useState([]);

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setError(new Error("No logged-in user found."));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Promise.allSettled so a failing faculties call doesn't block the
      // whole page — profile is the one piece that's required.
      const [profileRes, facultiesRes] = await Promise.allSettled([
        userService.getById(userId),
        userService.getFacultiesByUser(userId),
      ]);

      if (profileRes.status !== "fulfilled") {
        throw profileRes.reason ?? new Error("Failed to load profile.");
      }
      const raw = profileRes.value?.data?.data ?? profileRes.value?.data;
      setProfile(normalizeProfile(raw));

      if (facultiesRes.status === "fulfilled") {
        const rawFaculties = facultiesRes.value?.data?.data ?? facultiesRes.value?.data ?? [];
        setFaculties(normalizeFaculties(rawFaculties));
      } else {
        // Don't hard-fail the page over this — just show an empty
        // faculties card and let the user know via a toast once.
        setFaculties([]);
        const status = facultiesRes.reason?.response?.status;
        if (status === 403) {
          toast.error("You don't have permission to view assigned faculties.");
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Clean up the object URL whenever the preview changes or the page unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      toast.error(validationError);
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = ""; // lets the same file be re-selected later if cancelled
  };

  const handleCancelSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleUploadConfirm = async () => {
    if (!selectedFile || !userId) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setUploading(true);
      await userService.uploadProfileImage(userId, formData);
      toast.success("Profile picture updated successfully.");
      handleCancelSelection();
      await fetchProfile();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 413) toast.error("Image file is too large.");
      else if (status === 400) toast.error("Invalid image file.");
      else if (status === 401 || status === 403) toast.error("You're not authorized to do this.");
      else toast.error("Failed to upload profile picture.");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveEdit = async (form) => {
    setSaving(true);
    try {
      // Confirmed real payload shape — phone is intentionally left out,
      // it's not part of the backend's update-profile contract.
      const payload = {
        name: form.fullName,
        email: form.email,
        collegename: form.collegeName,
      };
      await userService.update(userId, payload);
      toast.success("Profile updated successfully.");
      setIsEditing(false);
      await fetchProfile();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="teacher-profile">
        <div className="tp-skeleton-header sp-shimmer" />
        <div className="tp-skeleton-grid">
          <div className="tp-skeleton-card sp-shimmer" />
          <div className="tp-skeleton-card sp-shimmer" />
          <div className="tp-skeleton-card sp-shimmer" />
          <div className="tp-skeleton-card sp-shimmer" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="teacher-profile teacher-profile--error">
        <ErrorState
          message="We couldn't load your profile. Please try again."
          onRetry={fetchProfile}
        />
      </div>
    );
  }

  return (
    <div className="teacher-profile">
      <div className="teacher-profile__heading">
        <h1>Teacher Profile</h1>
        <p>Manage your personal information and teaching details.</p>
      </div>

      <ProfileHeader
        profile={profile}
        previewUrl={previewUrl}
        selectedFile={selectedFile}
        uploading={uploading}
        onFileSelect={handleFileSelect}
        onUploadConfirm={handleUploadConfirm}
        onCancelSelection={handleCancelSelection}
        fileInputRef={fileInputRef}
      />

      <div className="teacher-profile__grid">
        <PersonalInfoCard
          profile={profile}
          isEditing={isEditing}
          onEdit={() => setIsEditing(true)}
          onCancelEdit={() => setIsEditing(false)}
          onSave={handleSaveEdit}
          saving={saving}
        />
        <FacultiesCard faculties={faculties} />
        <AccountInfoCard profile={profile} />
        <SecurityCard profile={profile} />
      </div>
    </div>
  );
};

export default TeacherProfile;
