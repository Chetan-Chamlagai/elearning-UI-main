// student/pages/MyCourses.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BookOpen,
  ImageOff,
  ArrowRight,
  GraduationCap,
  Calendar,
  Folder,
} from "lucide-react";

import { EmptyState, ErrorState } from "../components/StateViews";
import { formatDate } from "../utils/helpers";
import useAuthImage from "../utils/useAuthImage";
import { getFreeEnrollments } from "../utils/freeEnrollment";
import { categoryService, paymentService } from "../../services/api"; // adjust path to match your actual services/api.js location

import "./MyCourses.css";

const FILTERS = [
  { key: "all", label: "All Courses" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
];

/**
 * Turns a raw payment record into the same shape as a free-enrollment
 * record so both can render through one <CourseCard />.
 *
 * NOTE: field names here (categoryId / categoryTitle / imageName /
 * mainCategory / status) follow the pattern used in the admin Payments
 * module (normalizePayment / totalPrice / categories array). Confirm
 * against your actual paymentService.getByUserId response and adjust
 * the fallbacks below if they differ.
 */
const normalizePaidEnrollment = (payment) => ({
  categoryId: payment.categoryId ?? payment.category?.categoryId,
  categoryTitle: payment.categoryTitle ?? payment.courseTitle ?? payment.category?.categoryTitle,
  categoryType: "PAID",
  mainCategory: payment.mainCategory ?? payment.category?.mainCategory,
  imageName: payment.imageName ?? payment.category?.imageName,
  enrolledAt: payment.approvedDate ?? payment.paymentDate ?? payment.createdDate,
  isFree: false,
});

const normalizeFreeEnrollment = (record) => ({
  ...record,
  isFree: true,
});

/* ============================================================
 * Course card
 * ============================================================ */
const CourseCard = ({ course, index, onOpen }) => {
  const { url: resolvedImage, isLoading: isImageLoading } = useAuthImage(
    course.imageName,
    categoryService.getImage
  );

  return (
    <motion.button
      className="my-course-card"
      onClick={() => onOpen(course.categoryId)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
    >
      <div className="my-course-card__image-wrap">
        {resolvedImage ? (
          <img src={resolvedImage} alt={course.categoryTitle} className="my-course-card__image" />
        ) : (
          <div className={`my-course-card__image-fallback ${isImageLoading ? "sp-shimmer" : ""}`}>
            {!isImageLoading && <ImageOff size={22} />}
          </div>
        )}
        <span className={`my-course-card__badge ${course.isFree ? "is-free" : "is-paid"}`}>
          {course.isFree ? "Free" : "Paid"}
        </span>
      </div>

      <div className="my-course-card__body">
        <p className="my-course-card__title">{course.categoryTitle || "Untitled Course"}</p>

        <div className="my-course-card__meta">
          {course.mainCategory && (
            <span>
              <Folder size={13} /> {course.mainCategory}
            </span>
          )}
          {course.enrolledAt && (
            <span>
              <Calendar size={13} /> Enrolled {formatDate(course.enrolledAt)}
            </span>
          )}
        </div>

        <span className="my-course-card__cta">
          Continue Learning <ArrowRight size={14} />
        </span>
      </div>
    </motion.button>
  );
};

/* ============================================================
 * Page
 * ============================================================ */
const MyCourses = () => {
  const navigate = useNavigate();
  const userId = localStorage.getItem("userId");

  const [paidCourses, setPaidCourses] = useState([]);
  const [freeCourses, setFreeCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");

  const loadMyCourses = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Free enrollments are local — instant, no request needed.
      setFreeCourses(getFreeEnrollments(userId).map(normalizeFreeEnrollment));

      // Paid enrollments still come from the backend (approved payments).
      // NOTE: confirm paymentService.getByUserId exists — swap the method
      // name below if your services/api.js uses something else.
      const res = await paymentService.getByUserId(userId);
      const payments = res?.data?.data ?? res?.data ?? [];
      const approved = payments.filter(
        (p) => (p.status || p.paymentStatus)?.toUpperCase?.() === "APPROVED"
      );
      setPaidCourses(approved.map(normalizePaidEnrollment));
    } catch (err) {
      // A failing paid-enrollment fetch shouldn't hide free enrollments —
      // only surface a hard error if we have nothing at all to show.
      setPaidCourses([]);
      if (!getFreeEnrollments(userId).length) {
        setError(err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMyCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allCourses = useMemo(
    () =>
      [...freeCourses, ...paidCourses].sort(
        (a, b) => new Date(b.enrolledAt || 0) - new Date(a.enrolledAt || 0)
      ),
    [freeCourses, paidCourses]
  );

  const visibleCourses = useMemo(() => {
    if (activeFilter === "free") return allCourses.filter((c) => c.isFree);
    if (activeFilter === "paid") return allCourses.filter((c) => !c.isFree);
    return allCourses;
  }, [allCourses, activeFilter]);

  const handleOpen = (categoryId) => navigate(`/student/course/${categoryId}`);

  return (
    <div className="my-courses">
      <div className="my-courses__header">
        <div className="my-courses__heading-group">
          <span className="my-courses__icon">
            <GraduationCap size={22} />
          </span>
          <div>
            <h1 className="my-courses__title">My Courses</h1>
            <p className="my-courses__subtitle">
              {allCourses.length
                ? `${allCourses.length} course${allCourses.length > 1 ? "s" : ""} you're enrolled in`
                : "Courses you enroll in will show up here"}
            </p>
          </div>
        </div>

        {allCourses.length > 0 && (
          <div className="my-courses__filters" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={activeFilter === f.key}
                className={`my-courses__filter ${activeFilter === f.key ? "is-active" : ""}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="my-courses__grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="my-course-card-skeleton sp-shimmer" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          message="We couldn't load your courses. Please try again."
          onRetry={loadMyCourses}
        />
      ) : visibleCourses.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} />}
          title={allCourses.length ? "No courses in this filter." : "No enrolled courses yet."}
          message={
            allCourses.length
              ? "Try switching to a different filter above."
              : "Browse courses and hit Enroll Now to get started — free courses unlock instantly."
          }
          actionLabel={allCourses.length ? undefined : "Browse Courses"}
          onAction={allCourses.length ? undefined : () => navigate("/student/browse-courses")}
        />
      ) : (
        <div className="my-courses__grid">
          {visibleCourses.map((course, index) => (
            <CourseCard
              key={course.categoryId ?? index}
              course={course}
              index={index}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyCourses;
