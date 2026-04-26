type GoogleCalendarProbeRequest = {
	type: "google-calendar-probe";
};

type GoogleCalendarDisconnectRequest = {
	type: "google-calendar-disconnect";
};

type GoogleCalendarEnsureAppCalendarRequest = {
	type: "google-calendar-ensure-app-calendar";
};

type GoogleCalendarCreateTestEventRequest = {
	type: "google-calendar-create-test-event";
};

type AssignmentSyncItem = {
	assignmentKey: string;
	courseId: string;
	courseName: string;
	entryId: string;
	title: string;
	dueTime?: number;
	closeTime?: number;
	entryURL?: string;
};

type GoogleCalendarSyncAssignmentsRequest = {
	type: "google-calendar-sync-assignments";
	assignments: AssignmentSyncItem[];
};

type AssignmentIcsItem = {
	assignmentKey: string;
	courseName: string;
	title: string;
	dueTime: number;
	entryURL?: string;
};

type BuildAssignmentIcsRequest = {
	type: "build-assignment-ics";
	assignments: AssignmentIcsItem[];
};

type CalendarSummary = {
	id: string;
	summary: string;
};

type GoogleCalendarProbeResponse = {
	ok: boolean;
	calendars?: CalendarSummary[];
	error?: string;
};

type GoogleCalendarDisconnectResponse = {
	ok: boolean;
	error?: string;
};

type GoogleCalendarEnsureAppCalendarResponse = {
	ok: boolean;
	calendarId?: string;
	created?: boolean;
	error?: string;
};

type GoogleCalendarCreateTestEventResponse = {
	ok: boolean;
	calendarId?: string;
	eventId?: string;
	error?: string;
};

type GoogleCalendarSyncAssignmentsResponse = {
	ok: boolean;
	calendarId?: string;
	created?: number;
	updated?: number;
	deleted?: number;
	skipped?: number;
	synced?: number;
	error?: string;
};

type BuildAssignmentIcsResponse = {
	ok: boolean;
	ics?: string;
	fileName?: string;
	exported?: number;
	skipped?: number;
	error?: string;
};

type GoogleCalendarIntegrationState = {
	appCalendarId?: string;
	assignmentEventMap: Record<string, string>;
};

type EnsuredCalendarResult = {
	calendarId: string;
	created: boolean;
	state: GoogleCalendarIntegrationState;
};

type UpsertResult = "created" | "updated";

const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CALENDAR_LIST_API = `${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList?maxResults=10`;
const GOOGLE_CALENDAR_STATE_STORAGE_KEY = "GoogleCalendarIntegrationStateV1";
const APP_CALENDAR_SUMMARY = "Comfortable KULMS";
const APP_CALENDAR_DESCRIPTION = "Calendar managed by Comfortable KULMS browser extension.";
const ASSIGNMENT_KEY_PROPERTY = "comfortableKulmsAssignmentKey";

const isGoogleCalendarProbeRequest = (message: unknown): message is GoogleCalendarProbeRequest => {
	return typeof message === "object" && message !== null && "type" in message && message.type === "google-calendar-probe";
};

const isGoogleCalendarDisconnectRequest = (message: unknown): message is GoogleCalendarDisconnectRequest => {
	return typeof message === "object" && message !== null && "type" in message && message.type === "google-calendar-disconnect";
};

const isGoogleCalendarEnsureAppCalendarRequest = (message: unknown): message is GoogleCalendarEnsureAppCalendarRequest => {
	return (
		typeof message === "object" &&
		message !== null &&
		"type" in message &&
		message.type === "google-calendar-ensure-app-calendar"
	);
};

const isGoogleCalendarCreateTestEventRequest = (message: unknown): message is GoogleCalendarCreateTestEventRequest => {
	return (
		typeof message === "object" &&
		message !== null &&
		"type" in message &&
		message.type === "google-calendar-create-test-event"
	);
};

const isGoogleCalendarSyncAssignmentsRequest = (message: unknown): message is GoogleCalendarSyncAssignmentsRequest => {
	return (
		typeof message === "object" &&
		message !== null &&
		"type" in message &&
		"assignments" in message &&
		message.type === "google-calendar-sync-assignments" &&
		Array.isArray(message.assignments)
	);
};

const isBuildAssignmentIcsRequest = (message: unknown): message is BuildAssignmentIcsRequest => {
	return (
		typeof message === "object" &&
		message !== null &&
		"type" in message &&
		"assignments" in message &&
		message.type === "build-assignment-ics" &&
		Array.isArray(message.assignments)
	);
};

const padDatePart = (value: number): string => {
	return String(value).padStart(2, "0");
};

const toIcsUtcDateTime = (timestampSeconds: number): string => {
	const date = new Date(timestampSeconds * 1000);
	return (
		date.getUTCFullYear().toString() +
		padDatePart(date.getUTCMonth() + 1) +
		padDatePart(date.getUTCDate()) +
		"T" +
		padDatePart(date.getUTCHours()) +
		padDatePart(date.getUTCMinutes()) +
		padDatePart(date.getUTCSeconds()) +
		"Z"
	);
};

const escapeIcsText = (value: string): string => {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\r\n|\r|\n/g, "\\n")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,");
};

const foldIcsLine = (line: string): string => {
	const maxLineLength = 75;
	if (line.length <= maxLineLength) return line;

	let folded = "";
	let remaining = line;
	let isFirstLine = true;

	while (remaining.length > maxLineLength) {
		const chunk = remaining.slice(0, maxLineLength);
		folded += isFirstLine ? chunk : ` ${chunk}`;
		folded += "\r\n";
		remaining = remaining.slice(maxLineLength);
		isFirstLine = false;
	}

	return folded + (isFirstLine ? remaining : ` ${remaining}`);
};

const sanitizeFileNamePart = (value: string): string => {
	return value.replace(/[^a-zA-Z0-9_-]/g, "-");
};

const toCalendarCourseTitle = (courseName: string): string => {
	const cleaned = courseName.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
	if (cleaned.length > 0) return cleaned;
	return courseName.trim();
};

const runBuildAssignmentIcs = async (assignments: AssignmentIcsItem[]): Promise<BuildAssignmentIcsResponse> => {
	try {
		const dedupedAssignments: Record<string, AssignmentIcsItem> = {};
		for (const assignment of assignments) {
			if (typeof assignment !== "object" || assignment === null) continue;
			if (typeof assignment.assignmentKey !== "string" || assignment.assignmentKey.length === 0) continue;
			dedupedAssignments[assignment.assignmentKey] = assignment;
		}

		const generatedAt = Date.now() / 1000;
		const filteredAssignments = Object.keys(dedupedAssignments)
			.map((key) => dedupedAssignments[key])
			.filter((assignment) => {
				return typeof assignment.dueTime === "number" && assignment.dueTime > generatedAt;
			});

		const lines: string[] = [
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//Comfortable KULMS//Assignment Export//EN",
			"CALSCALE:GREGORIAN",
			"METHOD:PUBLISH"
		];

		for (const assignment of filteredAssignments) {
			const dtstamp = toIcsUtcDateTime(generatedAt);
			const dtstart = toIcsUtcDateTime(assignment.dueTime);
			const dtend = toIcsUtcDateTime(assignment.dueTime + 60 * 30);
			const summary = toCalendarCourseTitle(assignment.courseName);
			const descriptionLines = [
				`Course: ${assignment.courseName}`,
				`Assignment: ${assignment.title}`,
				"Generated by Comfortable KULMS"
			];

			if (typeof assignment.entryURL === "string" && assignment.entryURL.length > 0) {
				descriptionLines.push(`URL: ${assignment.entryURL}`);
			}

			lines.push("BEGIN:VEVENT");
			lines.push(`UID:${escapeIcsText(`${assignment.assignmentKey}@comfortable-kulms`)}`);
			lines.push(`DTSTAMP:${dtstamp}`);
			lines.push(`DTSTART:${dtstart}`);
			lines.push(`DTEND:${dtend}`);
			lines.push(`SUMMARY:${escapeIcsText(summary)}`);
			lines.push(`DESCRIPTION:${escapeIcsText(descriptionLines.join("\n"))}`);
			if (typeof assignment.entryURL === "string" && assignment.entryURL.length > 0) {
				lines.push(`URL:${escapeIcsText(assignment.entryURL)}`);
			}
			lines.push("END:VEVENT");
		}

		lines.push("END:VCALENDAR");
		const ics = lines.map(foldIcsLine).join("\r\n") + "\r\n";

		const fileDate = new Date();
		const fileName = `comfortable-kulms-assignments-${sanitizeFileNamePart(
			`${fileDate.getFullYear()}${padDatePart(fileDate.getMonth() + 1)}${padDatePart(fileDate.getDate())}`
		)}.ics`;

		return {
			ok: true,
			ics,
			fileName,
			exported: filteredAssignments.length,
			skipped: Object.keys(dedupedAssignments).length - filteredAssignments.length
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Unexpected error"
		};
	}
};

const getDefaultIntegrationState = (): GoogleCalendarIntegrationState => {
	return {
		assignmentEventMap: {}
	};
};

const decodeIntegrationState = (data: unknown): GoogleCalendarIntegrationState => {
	const defaultState = getDefaultIntegrationState();
	if (typeof data !== "object" || data === null) return defaultState;

	const state = data as {
		appCalendarId?: unknown;
		assignmentEventMap?: unknown;
	};

	const decoded: GoogleCalendarIntegrationState = {
		appCalendarId: typeof state.appCalendarId === "string" ? state.appCalendarId : undefined,
		assignmentEventMap: {}
	};

	if (typeof state.assignmentEventMap === "object" && state.assignmentEventMap !== null) {
		for (const key of Object.keys(state.assignmentEventMap as Record<string, unknown>)) {
			const value = (state.assignmentEventMap as Record<string, unknown>)[key];
			if (typeof value === "string") {
				decoded.assignmentEventMap[key] = value;
			}
		}
	}

	return decoded;
};

const loadIntegrationState = (): Promise<GoogleCalendarIntegrationState> => {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(GOOGLE_CALENDAR_STATE_STORAGE_KEY, (items: Record<string, unknown>) => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}

			const stored = items[GOOGLE_CALENDAR_STATE_STORAGE_KEY];
			resolve(decodeIntegrationState(stored));
		});
	});
};

const saveIntegrationState = (state: GoogleCalendarIntegrationState): Promise<void> => {
	return new Promise((resolve, reject) => {
		chrome.storage.local.set({ [GOOGLE_CALENDAR_STATE_STORAGE_KEY]: state }, () => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve();
		});
	});
};

const getAuthToken = (interactive: boolean): Promise<string> => {
	return new Promise((resolve, reject) => {
		chrome.identity.getAuthToken({ interactive }, (result) => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			if (!result) {
				reject(new Error("Google OAuth token could not be obtained."));
				return;
			}
			resolve(result);
		});
	});
};

const removeCachedToken = (token: string): Promise<void> => {
	return new Promise((resolve, reject) => {
		chrome.identity.removeCachedAuthToken({ token }, () => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve();
		});
	});
};

const clearAllTokens = (): Promise<void> => {
	return new Promise((resolve, reject) => {
		chrome.identity.clearAllCachedAuthTokens(() => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve();
		});
	});
};

const readApiErrorMessage = async (response: Response): Promise<string> => {
	try {
		const json = (await response.clone().json()) as {
			error?: {
				message?: string;
			};
		};
		if (json.error && typeof json.error.message === "string") {
			return json.error.message;
		}
	} catch {
		// Ignore parsing errors and fallback to raw text.
	}

	try {
		const text = await response.text();
		if (text.length > 0) return text;
	} catch {
		// Ignore body read errors.
	}

	return response.statusText || "Unknown API error";
};

const fetchCalendarApi = async (
	token: string,
	url: string,
	method: "GET" | "POST" | "PATCH" | "DELETE",
	body?: Record<string, unknown>,
	allowedStatuses: number[] = []
): Promise<Response> => {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`
	};

	const requestInit: RequestInit = {
		method,
		headers,
		cache: "no-store"
	};

	if (typeof body !== "undefined") {
		headers["Content-Type"] = "application/json";
		requestInit.body = JSON.stringify(body);
	}

	const response = await fetch(url, requestInit);
	if (response.status === 401) {
		await removeCachedToken(token);
		throw new Error("Unauthorized. Please retry authentication.");
	}

	if (!response.ok && allowedStatuses.indexOf(response.status) === -1) {
		const errorMessage = await readApiErrorMessage(response);
		throw new Error(`Calendar API request failed (${response.status}): ${errorMessage}`);
	}

	return response;
};

const listCalendars = async (token: string): Promise<CalendarSummary[]> => {
	const response = await fetchCalendarApi(token, GOOGLE_CALENDAR_LIST_API, "GET");

	const json = (await response.json()) as {
		items?: Array<{ id?: string; summary?: string }>;
	};

	if (!Array.isArray(json.items)) return [];

	return json.items
		.filter((item) => typeof item.id === "string" && typeof item.summary === "string")
		.map((item) => ({
			id: item.id as string,
			summary: item.summary as string
		}));
};

const ensureAppCalendar = async (token: string): Promise<EnsuredCalendarResult> => {
	const state = await loadIntegrationState();

	if (typeof state.appCalendarId === "string" && state.appCalendarId.length > 0) {
		const checkUrl = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(state.appCalendarId)}`;
		const response = await fetchCalendarApi(token, checkUrl, "GET", undefined, [404]);
		if (response.status !== 404) {
			return {
				calendarId: state.appCalendarId,
				created: false,
				state
			};
		}

		state.appCalendarId = undefined;
		state.assignmentEventMap = {};
	}

	const calendars = await listCalendars(token);
	const existing = calendars.find((calendar) => calendar.summary === APP_CALENDAR_SUMMARY);
	if (existing) {
		state.appCalendarId = existing.id;
		await saveIntegrationState(state);
		return {
			calendarId: existing.id,
			created: false,
			state
		};
	}

	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
	const createResponse = await fetchCalendarApi(token, `${GOOGLE_CALENDAR_API_BASE}/calendars`, "POST", {
		summary: APP_CALENDAR_SUMMARY,
		description: APP_CALENDAR_DESCRIPTION,
		timeZone
	});

	const created = (await createResponse.json()) as {
		id?: string;
	};

	if (typeof created.id !== "string" || created.id.length === 0) {
		throw new Error("Calendar API did not return app calendar id.");
	}

	state.appCalendarId = created.id;
	if (!state.assignmentEventMap) {
		state.assignmentEventMap = {};
	}
	await saveIntegrationState(state);

	return {
		calendarId: created.id,
		created: true,
		state
	};
};

const selectDueTimestamp = (assignment: AssignmentSyncItem): number | undefined => {
	if (typeof assignment.dueTime === "number" && assignment.dueTime > 0) {
		return assignment.dueTime;
	}

	if (typeof assignment.closeTime === "number" && assignment.closeTime > 0) {
		return assignment.closeTime;
	}

	return undefined;
};

const buildAssignmentEventResource = (
	assignment: AssignmentSyncItem,
	dueTimestamp: number
): Record<string, unknown> => {
	let startTimestamp = dueTimestamp - 3600;
	if (startTimestamp < 0) {
		startTimestamp = 0;
	}
	if (startTimestamp >= dueTimestamp) {
		startTimestamp = dueTimestamp;
	}

	const descriptionLines = [
		`Course: ${assignment.courseName}`,
		`Course ID: ${assignment.courseId}`,
		`Assignment ID: ${assignment.entryId}`
	];

	if (assignment.entryURL) {
		descriptionLines.push(assignment.entryURL);
	}

	const event: Record<string, unknown> = {
		summary: toCalendarCourseTitle(assignment.courseName),
		description: descriptionLines.join("\n"),
		start: {
			dateTime: new Date(startTimestamp * 1000).toISOString()
		},
		end: {
			dateTime: new Date(dueTimestamp * 1000).toISOString()
		},
		extendedProperties: {
			private: {
				[ASSIGNMENT_KEY_PROPERTY]: assignment.assignmentKey
			}
		}
	};

	if (assignment.entryURL) {
		event.source = {
			title: "Open in KULMS",
			url: assignment.entryURL
		};
	}

	return event;
};

const createEvent = async (
	token: string,
	calendarId: string,
	eventResource: Record<string, unknown>
): Promise<string> => {
	const createUrl = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
	const response = await fetchCalendarApi(token, createUrl, "POST", eventResource);
	const json = (await response.json()) as {
		id?: string;
	};

	if (typeof json.id !== "string" || json.id.length === 0) {
		throw new Error("Calendar event creation failed because no event id was returned.");
	}

	return json.id;
};

const deleteEvent = async (token: string, calendarId: string, eventId: string): Promise<boolean> => {
	const deleteUrl = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
	const response = await fetchCalendarApi(token, deleteUrl, "DELETE", undefined, [404, 410]);
	return response.status !== 404 && response.status !== 410;
};

const upsertAssignmentEvent = async (
	token: string,
	calendarId: string,
	assignment: AssignmentSyncItem,
	eventResource: Record<string, unknown>,
	state: GoogleCalendarIntegrationState
): Promise<UpsertResult> => {
	const existingEventId = state.assignmentEventMap[assignment.assignmentKey];
	if (typeof existingEventId === "string" && existingEventId.length > 0) {
		const updateUrl = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}`;
		const updateResponse = await fetchCalendarApi(token, updateUrl, "PATCH", eventResource, [404]);
		if (updateResponse.status !== 404) {
			return "updated";
		}
	}

	const createdEventId = await createEvent(token, calendarId, eventResource);
	state.assignmentEventMap[assignment.assignmentKey] = createdEventId;
	return "created";
};

const runGoogleCalendarProbe = async (): Promise<GoogleCalendarProbeResponse> => {
	try {
		const token = await getAuthToken(true);
		const calendars = await listCalendars(token);
		return {
			ok: true,
			calendars
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Unexpected error"
		};
	}
};

const runGoogleCalendarDisconnect = async (): Promise<GoogleCalendarDisconnectResponse> => {
	try {
		await clearAllTokens();
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Unexpected error"
		};
	}
};

const runEnsureAppCalendar = async (): Promise<GoogleCalendarEnsureAppCalendarResponse> => {
	try {
		const token = await getAuthToken(true);
		const result = await ensureAppCalendar(token);
		return {
			ok: true,
			calendarId: result.calendarId,
			created: result.created
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Unexpected error"
		};
	}
};

const runCreateTestEvent = async (): Promise<GoogleCalendarCreateTestEventResponse> => {
	try {
		const token = await getAuthToken(true);
		const ensured = await ensureAppCalendar(token);
		const now = new Date();
		const start = new Date(now.getTime() + 5 * 60 * 1000);
		const end = new Date(now.getTime() + 35 * 60 * 1000);

		const eventResource: Record<string, unknown> = {
			summary: "[KULMS] Google Calendar integration test",
			description: "This is a test event created by Comfortable KULMS.",
			start: {
				dateTime: start.toISOString()
			},
			end: {
				dateTime: end.toISOString()
			}
		};

		const eventId = await createEvent(token, ensured.calendarId, eventResource);
		return {
			ok: true,
			calendarId: ensured.calendarId,
			eventId
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Unexpected error"
		};
	}
};

const runSyncAssignments = async (
	assignments: AssignmentSyncItem[]
): Promise<GoogleCalendarSyncAssignmentsResponse> => {
	try {
		const token = await getAuthToken(true);
		const ensured = await ensureAppCalendar(token);
		const state = ensured.state;
		if (!state.assignmentEventMap) {
			state.assignmentEventMap = {};
		}

		const dedupedAssignments: Record<string, AssignmentSyncItem> = {};
		for (const assignment of assignments) {
			if (typeof assignment.assignmentKey !== "string" || assignment.assignmentKey.length === 0) continue;
			dedupedAssignments[assignment.assignmentKey] = assignment;
		}

		let created = 0;
		let updated = 0;
		let deleted = 0;
		let skipped = 0;
		const nowTimestamp = Date.now() / 1000;

		for (const assignmentKey of Object.keys(state.assignmentEventMap)) {
			if (assignmentKey in dedupedAssignments) continue;

			const staleEventId = state.assignmentEventMap[assignmentKey];
			if (typeof staleEventId === "string" && staleEventId.length > 0) {
				const deletedFromCalendar = await deleteEvent(token, ensured.calendarId, staleEventId);
				if (deletedFromCalendar) {
					deleted++;
				}
			}

			delete state.assignmentEventMap[assignmentKey];
		}

		for (const assignmentKey of Object.keys(dedupedAssignments)) {
			const assignment = dedupedAssignments[assignmentKey];
			const dueTimestamp = selectDueTimestamp(assignment);
			if (typeof dueTimestamp === "undefined" || dueTimestamp <= nowTimestamp) {
				const staleEventId = state.assignmentEventMap[assignment.assignmentKey];
				if (typeof staleEventId === "string" && staleEventId.length > 0) {
					const deletedFromCalendar = await deleteEvent(token, ensured.calendarId, staleEventId);
					if (deletedFromCalendar) {
						deleted++;
					}
					delete state.assignmentEventMap[assignment.assignmentKey];
				}

				skipped++;
				continue;
			}

			const eventResource = buildAssignmentEventResource(assignment, dueTimestamp);
			const upsertResult = await upsertAssignmentEvent(
				token,
				ensured.calendarId,
				assignment,
				eventResource,
				state
			);

			if (upsertResult === "created") {
				created++;
			} else {
				updated++;
			}
		}

		await saveIntegrationState(state);

		return {
			ok: true,
			calendarId: ensured.calendarId,
			created,
			updated,
			deleted,
			skipped,
			synced: created + updated
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Unexpected error"
		};
	}
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
	if (isGoogleCalendarProbeRequest(message)) {
		void runGoogleCalendarProbe().then((result) => {
			sendResponse(result);
		});
		return true;
	}

	if (isGoogleCalendarDisconnectRequest(message)) {
		void runGoogleCalendarDisconnect().then((result) => {
			sendResponse(result);
		});
		return true;
	}

	if (isGoogleCalendarEnsureAppCalendarRequest(message)) {
		void runEnsureAppCalendar().then((result) => {
			sendResponse(result);
		});
		return true;
	}

	if (isGoogleCalendarCreateTestEventRequest(message)) {
		void runCreateTestEvent().then((result) => {
			sendResponse(result);
		});
		return true;
	}

	if (isGoogleCalendarSyncAssignmentsRequest(message)) {
		void runSyncAssignments(message.assignments).then((result) => {
			sendResponse(result);
		});
		return true;
	}

	if (isBuildAssignmentIcsRequest(message)) {
		void runBuildAssignmentIcs(message.assignments).then((result) => {
			sendResponse(result);
		});
		return true;
	}

	return false;
});
