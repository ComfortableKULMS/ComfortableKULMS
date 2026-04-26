import { Assignment } from "../entity/assignment/types";
import { Quiz } from "../entity/quiz/types";
import { Course } from "../course/types";
import { decodeAssignmentFromAPI } from "../entity/assignment/decode";
import { decodeQuizFromAPI } from "../entity/quiz/decode";

/* Sakai のURLを取得する */
export const getBaseURL = (): string => {
    let baseURL = "";
    const match = location.href.match("(https?://[^/]+)/portal");
    if (match) {
        baseURL = match[1];
    }
    return baseURL;
};

/* Sakai のお気に入り欄からCourseを取得する */
export const fetchCourse = (): Array<Course> => {
    const baseURL = getBaseURL();
    const elementCollection = document.getElementsByClassName("fav-sites-entry");
    const elements = Array.prototype.slice.call(elementCollection);
    const courses: Array<Course> = [];
    for (const elem of elements) {
        const name = elem.getElementsByTagName("div")[0].getElementsByTagName("a")[0];
        const m = name.href.match("(https?://[^/]+)/portal/site-?[a-z]*/([^/]+)");
        if (m && m[2][0] !== "~") {
            const course: Course = {
                id: m[2],
                name: name.title,
                link: baseURL + "/portal/site/" + m[2]
            };
            courses.push(course);
        }
    }
    return courses;
};

/* page/[pageId] URL にリクエストして 302 リダイレクト先から tool placement ID を取得する */
const fetchToolPlacementURL = async (pageURL: string): Promise<string | null> => {
    try {
        const response = await fetch(pageURL, { cache: "no-cache" });
        const finalURL = response.url;
        response.body?.cancel();
        const match = finalURL.match(/\/tool(?:-reset)?\/([^/?#]+)/);
        if (!match) return null;
        const toolPlacementId = match[1];
        return finalURL.replace(/\/tool(?:-reset)?\/[^/?#]+.*$/, `/tool-reset/${toolPlacementId}`);
    } catch (err) {
        console.error(err);
        return null;
    }
};

/* course.id ごとに解決済み assignment page URL をキャッシュする */
const assignmentPageURLCache = new Map<string, string>();

/* /direct/site/[siteId].json の sitePages から「課題」ページの tool-reset URL を取得する */
const fetchAssignmentPageURL = async (siteId: string): Promise<string | null> => {
    const cached = assignmentPageURLCache.get(siteId);
    if (cached !== undefined) return cached;

    const queryURL = getBaseURL() + "/direct/site/" + siteId + ".json";
    try {
        const response = await fetch(queryURL, { cache: "no-cache" });
        if (!response.ok) return null;
        const data = await response.json();
        const pages: any[] = data.sitePages ?? [];
        for (const page of pages) {
            if (page.title === "課題" && page.url) {
                const url = await fetchToolPlacementURL(page.url);
                if (url) assignmentPageURLCache.set(siteId, url);
                return url;
            }
        }
        return null;
    } catch (err) {
        console.error(err);
        return null;
    }
};

/* Sakai APIから課題を取得する */
export const fetchAssignment = (course: Course): Promise<Assignment> => {
    const queryURL = getBaseURL() + "/direct/assignment/site/" + course.id + ".json";
    return new Promise((resolve, reject) => {
        fetch(queryURL, { cache: "no-cache" })
            .then(async (response) => {
                if (response.ok) {
                    const data = await response.json();
                    const assignmentEntries = decodeAssignmentFromAPI(data);
                    const assignmentPageURL = await fetchAssignmentPageURL(course.id);
                    if (assignmentPageURL) {
                        assignmentEntries.forEach(e => { e.assignmentPageURL = assignmentPageURL; });
                    }
                    resolve(new Assignment(course, assignmentEntries, false));
                } else {
                    reject(`Request failed: ${response.status}`);
                }
            })
            .catch((err) => console.error(err)); // Error: Request failed: 404
    });
};

/* Sakai APIからクイズを取得する */
export const fetchQuiz = (course: Course): Promise<Quiz> => {
    const queryURL = getBaseURL() + "/direct/sam_pub/context/" + course.id + ".json";
    return new Promise((resolve, reject) => {
        fetch(queryURL, { cache: "no-cache" })
            .then(async (response) => {
                if (response.ok) {
                    const data = await response.json();
                    const quizEntries = decodeQuizFromAPI(data);
                    resolve(new Quiz(course, quizEntries, true));
                } else {
                    reject(`Request failed: ${response.status}`);
                }
            })
            .catch((err) => console.error(err)); // Error: Request failed: 404
    });
};
