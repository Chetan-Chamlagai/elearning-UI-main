import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { userService, categoryService, examService } from "../../services/api"; // ADJUST PATH to your project
import {
  normalizeTeacherFaculties,
  normalizeCategories,
  getAllowedCategories,
  normalizeExam,
} from "../utils/examHelpers";

/**
 * useTeacherExams
 * ---------------------------------------------------------------------
 * 1. Reads the logged-in teacher from localStorage.
 * 2. Fetches the teacher's assigned faculties (userService.getFacultiesByUser).
 * 3. Fetches all categories and matches them against the teacher's faculties
 *    to get the allowed category list (source of truth for access control).
 * 4. For EACH allowed category, fetches exams via examService.getByCategory
 *    (this is the "get exam by faculty" call) using Promise.allSettled so
 *    one failing faculty doesn't break the whole page.
 * ---------------------------------------------------------------------
 */
export function useTeacherExams() {
  const [userId, setUserId] = useState(null);
  const [noUser, setNoUser] = useState(false);

  const [allowedCategories, setAllowedCategories] = useState([]);
  const [facultyLoading, setFacultyLoading] = useState(true);
  const [facultyError, setFacultyError] = useState(null);

  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState(null);

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

  // ---- Step 2 & 3: faculties + categories ----
  const loadFaculties = useCallback(async () => {
    if (!userId) return;
    setFacultyLoading(true);
    setFacultyError(null);
    try {
      const [facultyRes, categoryRes] = await Promise.all([
        userService.getFacultiesByUser(userId),
        categoryService.getAll(),
      ]);

      const teacherFaculties = normalizeTeacherFaculties(facultyRes?.data);
      const allCategories = normalizeCategories(categoryRes?.data);
      const allowed = getAllowedCategories(teacherFaculties, allCategories);

      setAllowedCategories(allowed);
    } catch (err) {
      setFacultyError(err);
      toast.error("Failed to load your faculties.");
    } finally {
      setFacultyLoading(false);
    }
  }, [userId]);

  // ---- Step 4: exams per allowed category ----
  const loadExams = useCallback(async () => {
    if (allowedCategories.length === 0) {
      setExams([]);
      setExamsLoading(false);
      return;
    }
    setExamsLoading(true);
    setExamsError(null);
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
        // silently skip a faculty whose exam fetch failed — don't block the page
      });

      setExams(merged);

      const anyFailed = results.some((r) => r.status === "rejected");
      if (anyFailed) {
        toast.error("Some exams could not be loaded for one or more faculties.");
      }
    } catch (err) {
      setExamsError(err);
      toast.error("Failed to load exams.");
    } finally {
      setExamsLoading(false);
    }
  }, [allowedCategories]);

  useEffect(() => {
    loadFaculties();
  }, [loadFaculties]);

  useEffect(() => {
    if (!facultyLoading) loadExams();
  }, [facultyLoading, loadExams]);

  return {
    userId,
    noUser,
    allowedCategories,
    facultyLoading,
    facultyError,
    exams,
    examsLoading,
    examsError,
    refetchExams: loadExams,
    refetchFaculties: loadFaculties,
  };
}
