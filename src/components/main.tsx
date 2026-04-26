import React, { useContext, useState } from "react";
import { useTranslation, useTranslationArgsDeps } from "./helper";
import { formatTimestamp, getEntities, updateIsReadFlag } from "../utils";
import { EntityUnion, EntryTab, EntryUnion, MemoAddInfo } from "./entryTab";
import { SettingsChange, SettingsTab } from "./settings";
import _ from "lodash";
import { applyColorSettings, toggleMiniSakai } from "../minisakai";
import { Settings } from "../features/setting/types";
import { getStoredSettings } from "../features/setting/getSetting";
import { saveSettings } from "../features/setting/saveSetting";
import { addFavoritedCourseSites } from "../features/favorite";
import { getBaseURL } from "../features/api/fetch";
import { v4 as uuidv4 } from "uuid";
import { MemoEntry } from "../features/entity/memo/types";
import { removeMemoEntry, saveNewMemoEntry } from "../features/entity/memo/saveMemo";
import { createFavoritesBar, resetFavoritesBar } from "./favoritesBar";
import { getSakaiCourses } from "../features/course/getCourse";
import { createKulmsTopNav } from "../features/topnav/topnav";
import { handleCollapseHome } from "../features/homeClose/homeClose";
import { Assignment, AssignmentEntry } from "../features/entity/assignment/types";

export const MiniSakaiContext = React.createContext<{
    settings: Settings;
}>({
    settings: new Settings()
});

type MiniSakaiRootProps = { subset: boolean; hostname: string };
type MiniSakaiRootState = {
    settings: Settings;
    entities: EntityUnion[];
    shownTab: "assignment" | "settings";
    memoBoxShown: boolean;
};

type GoogleCalendarProbeRequest = {
    type: "google-calendar-probe";
};

type GoogleCalendarDisconnectRequest = {
    type: "google-calendar-disconnect";
};

type GoogleCalendarEnsureCalendarRequest = {
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

type GoogleCalendarProbeResponse = {
    ok: boolean;
    calendars?: Array<{
        id: string;
        summary: string;
    }>;
    error?: string;
};

type GoogleCalendarDisconnectResponse = {
    ok: boolean;
    error?: string;
};

type GoogleCalendarEnsureCalendarResponse = {
    ok: boolean;
    calendarId?: string;
    created?: boolean;
    error?: string;
};

type GoogleCalendarCreateTestEventResponse = {
    ok: boolean;
    eventId?: string;
    calendarId?: string;
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

const sendBackgroundMessage = <T,>(
    message:
        | GoogleCalendarProbeRequest
        | GoogleCalendarDisconnectRequest
        | GoogleCalendarEnsureCalendarRequest
        | GoogleCalendarCreateTestEventRequest
        | GoogleCalendarSyncAssignmentsRequest
): Promise<T> => {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response: T | undefined) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (typeof response === "undefined") {
                reject(new Error("No response from background."));
                return;
            }
            resolve(response);
        });
    });
};

const buildAssignmentEntryURL = (courseId: string, entry: AssignmentEntry): string | undefined => {
    if (!entry.assignmentPageURL) {
        return entry.entityURL;
    }

    const toolPlacementMatch = entry.assignmentPageURL.match(/\/(?:page|tool-reset)\/([^/?#]+)/);
    if (!toolPlacementMatch) {
        return entry.assignmentPageURL;
    }

    try {
        const origin = new URL(entry.assignmentPageURL).origin;
        const toolPlacementId = toolPlacementMatch[1];
        return `${origin}/portal/site/${courseId}/tool/${toolPlacementId}?assignmentReference=/assignment/a/${courseId}/${entry.id}&sakai_action=doView_submission`;
    } catch {
        return entry.assignmentPageURL;
    }
};

export class MiniSakaiRoot extends React.Component<MiniSakaiRootProps, MiniSakaiRootState> {
    constructor(props: MiniSakaiRootProps) {
        super(props);
        this.state = {
            settings: new Settings(),
            entities: new Array<EntityUnion>(),
            shownTab: "assignment",
            memoBoxShown: false
        };

        this.onCheck = this.onCheck.bind(this);
        this.onMemoAdd = this.onMemoAdd.bind(this);
        this.onMemoDelete = this.onMemoDelete.bind(this);
        this.onSettingsChange = this.onSettingsChange.bind(this);
    }

    componentDidMount() {
        getStoredSettings(this.props.hostname).then((s) => {
            this.setState({ settings: s }, () => {
                this.reloadEntities();
            });
        });
    }

    reloadEntities() {
        const cacheOnly = this.props.subset;
        getEntities(this.state.settings, getSakaiCourses(), cacheOnly).then((entities) => {
            const allEntities = [...entities.assignment, ...entities.quiz, ...entities.memo];
            this.setState({
                entities: allEntities
            });
            updateIsReadFlag(window.location.href, entities.assignment, this.props.hostname);
        });
    }

    private onCheck(entry: EntryUnion, checked: boolean) {
        const newEntry = _.cloneDeep(entry);
        newEntry.hasFinished = checked;
        newEntry.save(this.props.hostname).then(() => {
            this.reloadEntities();
        });
    }

    private onMemoAdd(memo: MemoAddInfo) {
        const newMemo = new MemoEntry(uuidv4(), memo.content, memo.due, false);
        saveNewMemoEntry(this.state.settings.appInfo.hostname, newMemo, memo.course).then(() => {
            this.reloadEntities();
        });
    }

    private onMemoDelete(entry: EntryUnion) {
        removeMemoEntry(this.state.settings.appInfo.hostname, entry as MemoEntry).then(() => {
            this.reloadEntities();
        });
    }

    private onSettingsChange(change: SettingsChange) {
        const newSettings = _.cloneDeep(this.state.settings);
        if (change.type === "reset-color") {
            const _settings = new Settings();
            newSettings.color = _settings.color;
            saveSettings(this.state.settings.appInfo.hostname, newSettings).then(() => {
                this.setState({
                    settings: newSettings
                });
            });
            return;
        }

        _.set(newSettings, change.id, change.newValue);
        saveSettings(this.state.settings.appInfo.hostname, newSettings).then(() => {
            this.setState({
                settings: newSettings
            });
        });
    }

    private collectAssignmentSyncItems(): AssignmentSyncItem[] {
        const items: AssignmentSyncItem[] = [];

        for (const entity of this.state.entities) {
            if (!(entity instanceof Assignment)) continue;

            const course = entity.getCourse();
            for (const entry of entity.entries) {
                if (entry.hasFinished) continue;

                const dueTime = typeof entry.dueTime === "number" && entry.dueTime > 0 ? entry.dueTime : undefined;
                const closeTime =
                    typeof entry.closeTime === "number" && entry.closeTime > 0 ? entry.closeTime : undefined;
                if (typeof dueTime === "undefined" && typeof closeTime === "undefined") continue;

                items.push({
                    assignmentKey: `${course.id}:${entry.id}`,
                    courseId: course.id,
                    courseName: course.name ?? "(unknown course)",
                    entryId: entry.id,
                    title: entry.title,
                    dueTime,
                    closeTime,
                    entryURL: buildAssignmentEntryURL(course.id, entry)
                });
            }
        }

        return items;
    }

    componentDidUpdate(prevProps: MiniSakaiRootProps, prevState: MiniSakaiRootState) {
        if (!_.isEqual(prevState.entities, this.state.entities)) {
            getStoredSettings(this.props.hostname).then((s) => {
                this.setState({
                    settings: s
                });
                addFavoritedCourseSites(getBaseURL()).then(() => {
                    createKulmsTopNav(s);
                    resetFavoritesBar();
                    createFavoritesBar(s, this.state.entities);
                });
            });
        }
        if (!_.isEqual(prevState.settings, this.state.settings)) {
            createKulmsTopNav(this.state.settings);
            resetFavoritesBar();
            createFavoritesBar(this.state.settings, this.state.entities);
            applyColorSettings(this.state.settings, this.props.subset);
            handleCollapseHome(this.state.settings);
        }
    }

    render(): React.ReactNode {
        const entryTabShown = this.state.shownTab === "assignment";
        const settingsTabShown = this.state.shownTab === "settings";
        const assignmentSyncItems = this.collectAssignmentSyncItems();

        return (
            <MiniSakaiContext.Provider
                value={{
                    settings: this.state.settings
                }}
            >
                <MiniSakaiLogo />
                <MiniSakaiVersion />
                {this.props.subset ? <GoogleCalendarQuickActions assignments={assignmentSyncItems} /> : null}
                {this.props.subset ? null : (
                    <>
                        <MiniSakaiClose onClose={() => toggleMiniSakai()} />
                        <MiniSakaiTabs
                            onAssignment={() =>
                                this.setState({
                                    shownTab: "assignment"
                                })
                            }
                            onSettings={() =>
                                this.setState({
                                    shownTab: "settings"
                                })
                            }
                            selection={this.state.shownTab}
                        />
                        {this.state.shownTab === "assignment" ? (
                            <>
                                <button
                                    id='cs-add-memo-btn'
                                    onClick={() => {
                                        this.setState((state) => {
                                            return {
                                                memoBoxShown: !state.memoBoxShown
                                            };
                                        });
                                    }}
                                >
                                    +
                                </button>
                                <MiniSakaiAssignmentTime />
                                <MiniSakaiQuizTime />
                            </>
                        ) : null}
                    </>
                )}
                {entryTabShown ? (
                    <EntryTab
                        showMemoBox={this.state.memoBoxShown}
                        isSubset={this.props.subset}
                        entities={this.state.entities}
                        settings={this.state.settings}
                        onCheck={this.onCheck}
                        onMemoAdd={this.onMemoAdd}
                        onDelete={this.onMemoDelete}
                    />
                ) : null}
                {settingsTabShown ? (
                    <SettingsTab settings={this.state.settings} onSettingsChange={this.onSettingsChange} />
                ) : null}
            </MiniSakaiContext.Provider>
        );
    }
}

function MiniSakaiLogo() {
    const src = chrome.runtime.getURL("img/logo.png");
    return <img className='cs-minisakai-logo' alt='logo' src={src} />;
}

function MiniSakaiVersion() {
    const ctx = useContext(MiniSakaiContext);
    return <p className='cs-version'>Version {ctx.settings.appInfo.version}</p>;
}

function MiniSakaiClose(props: { onClose: () => void }) {
    return (
        <button type="button" className="closebtn q" onClick={props.onClose}>
            <img src={chrome.runtime.getURL("img/closeBtn.svg")} alt="close" />
        </button>
    );
}

function MiniSakaiTabs(props: {
    onAssignment: () => void;
    onSettings: () => void;
    selection: "assignment" | "settings";
}) {
    const assignmentTab = useTranslation("tab_assignments");
    const settingsTab = useTranslation("tab_settings");
    const assignmentChecked = props.selection === "assignment";
    const settingsChecked = props.selection === "settings";
    return (
        <>
            <input
                id='assignmentTab'
                type='radio'
                name='cs-tab'
                onClick={props.onAssignment}
                defaultChecked={assignmentChecked}
            />
            <label htmlFor='assignmentTab'> {assignmentTab} </label>
            <input
                id='settingsTab'
                type='radio'
                name='cs-tab'
                onClick={props.onSettings}
                defaultChecked={settingsChecked}
            />
            <label htmlFor='settingsTab'> {settingsTab} </label>
        </>
    );
}

function MiniSakaiTimeBox(props: { clazz: string; title: string; time: string }) {
    return (
        <div className={props.clazz}>
            <p className='cs-assignment-time-text'>{props.title}</p>
            <p className='cs-assignment-time-text'>{props.time}</p>
        </div>
    );
}

function MiniSakaiAssignmentTime() {
    const ctx = useContext(MiniSakaiContext);
    const title = useTranslation("assignment_acquisition_date");
    const time = formatTimestamp(ctx.settings.fetchTime.assignment);
    return <MiniSakaiTimeBox clazz='cs-assignment-time' title={title} time={time} />;
}

function MiniSakaiQuizTime() {
    const ctx = useContext(MiniSakaiContext);
    const title = useTranslation("testquiz_acquisition_date");
    const time = formatTimestamp(ctx.settings.fetchTime.quiz);
    return <MiniSakaiTimeBox clazz='cs-quiz-time' title={title} time={time} />;
}

function GoogleCalendarQuickActions(props: { assignments: AssignmentSyncItem[] }) {
    const title = useTranslation("google_calendar_section_title");
    const connectLabel = useTranslation("google_calendar_connect");
    const disconnectLabel = useTranslation("google_calendar_disconnect");
    const createCalendarLabel = useTranslation("google_calendar_create_calendar");
    const createTestEventLabel = useTranslation("google_calendar_create_test_event");
    const syncAssignmentsLabel = useTranslation("google_calendar_sync_assignments");
    const statusIdle = useTranslation("google_calendar_status_idle");
    const statusChecking = useTranslation("google_calendar_status_checking");
    const statusCalendarReady = useTranslation("google_calendar_status_calendar_ready");
    const statusTestEventAdded = useTranslation("google_calendar_status_test_event_added");
    const statusDisconnected = useTranslation("google_calendar_status_disconnected");
    const statusErrorPrefix = useTranslation("google_calendar_status_error");

    const [calendarCount, setCalendarCount] = useState(0);
    const statusConnected = useTranslationArgsDeps(
        "google_calendar_status_connected",
        [String(calendarCount)],
        [calendarCount]
    );

    const [syncCreatedCount, setSyncCreatedCount] = useState(0);
    const [syncUpdatedCount, setSyncUpdatedCount] = useState(0);
    const [syncDeletedCount, setSyncDeletedCount] = useState(0);
    const [syncSkippedCount, setSyncSkippedCount] = useState(0);
    const syncTargetCount = useTranslationArgsDeps(
        "google_calendar_sync_target_count",
        [String(props.assignments.length)],
        [props.assignments.length]
    );
    const statusSynced = useTranslationArgsDeps(
        "google_calendar_status_synced",
        [String(syncCreatedCount), String(syncUpdatedCount), String(syncDeletedCount), String(syncSkippedCount)],
        [syncCreatedCount, syncUpdatedCount, syncDeletedCount, syncSkippedCount]
    );

    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<
        "idle" | "checking" | "connected" | "calendar-ready" | "test-event-added" | "sync-complete" | "disconnected" | "error"
    >("idle");
    const [errorText, setErrorText] = useState("");
    const [calendarPreview, setCalendarPreview] = useState("");

    const runProbe = async () => {
        setIsLoading(true);
        setStatus("checking");
        setErrorText("");

        try {
            const response = await sendBackgroundMessage<GoogleCalendarProbeResponse>({
                type: "google-calendar-probe"
            });

            if (!response.ok) {
                throw new Error(response.error ?? "Unknown error");
            }

            const calendars = response.calendars ?? [];
            const preview = calendars
                .map((calendar) => calendar.summary)
                .filter((summary) => summary.length > 0)
                .slice(0, 3)
                .join(" / ");

            setCalendarCount(calendars.length);
            setCalendarPreview(preview);
            setStatus("connected");
        } catch (error) {
            setStatus("error");
            setCalendarCount(0);
            setCalendarPreview("");
            setErrorText(error instanceof Error ? error.message : "Unexpected error");
        } finally {
            setIsLoading(false);
        }
    };

    const runEnsureCalendar = async () => {
        setIsLoading(true);
        setStatus("checking");
        setErrorText("");

        try {
            const response = await sendBackgroundMessage<GoogleCalendarEnsureCalendarResponse>({
                type: "google-calendar-ensure-app-calendar"
            });

            if (!response.ok) {
                throw new Error(response.error ?? "Unknown error");
            }

            setStatus("calendar-ready");
        } catch (error) {
            setStatus("error");
            setErrorText(error instanceof Error ? error.message : "Unexpected error");
        } finally {
            setIsLoading(false);
        }
    };

    const runCreateTestEvent = async () => {
        setIsLoading(true);
        setStatus("checking");
        setErrorText("");

        try {
            const response = await sendBackgroundMessage<GoogleCalendarCreateTestEventResponse>({
                type: "google-calendar-create-test-event"
            });

            if (!response.ok) {
                throw new Error(response.error ?? "Unknown error");
            }

            setStatus("test-event-added");
        } catch (error) {
            setStatus("error");
            setErrorText(error instanceof Error ? error.message : "Unexpected error");
        } finally {
            setIsLoading(false);
        }
    };

    const runSyncAssignments = async () => {
        setIsLoading(true);
        setStatus("checking");
        setErrorText("");

        try {
            const response = await sendBackgroundMessage<GoogleCalendarSyncAssignmentsResponse>({
                type: "google-calendar-sync-assignments",
                assignments: props.assignments
            });

            if (!response.ok) {
                throw new Error(response.error ?? "Unknown error");
            }

            setSyncCreatedCount(response.created ?? 0);
            setSyncUpdatedCount(response.updated ?? 0);
            setSyncDeletedCount(response.deleted ?? 0);
            setSyncSkippedCount(response.skipped ?? 0);
            setStatus("sync-complete");
        } catch (error) {
            setStatus("error");
            setErrorText(error instanceof Error ? error.message : "Unexpected error");
        } finally {
            setIsLoading(false);
        }
    };

    const runDisconnect = async () => {
        setIsLoading(true);
        setErrorText("");

        try {
            const response = await sendBackgroundMessage<GoogleCalendarDisconnectResponse>({
                type: "google-calendar-disconnect"
            });

            if (!response.ok) {
                throw new Error(response.error ?? "Unknown error");
            }

            setStatus("disconnected");
            setCalendarCount(0);
            setCalendarPreview("");
        } catch (error) {
            setStatus("error");
            setErrorText(error instanceof Error ? error.message : "Unexpected error");
        } finally {
            setIsLoading(false);
        }
    };

    let statusText = statusIdle;
    if (status === "checking") statusText = statusChecking;
    if (status === "connected") statusText = statusConnected;
    if (status === "calendar-ready") statusText = statusCalendarReady;
    if (status === "test-event-added") statusText = statusTestEventAdded;
    if (status === "sync-complete") statusText = statusSynced;
    if (status === "disconnected") statusText = statusDisconnected;

    return (
        <div className="cp-settings cs-google-calendar-panel">
            <p className="cs-google-calendar-title">{title}</p>
            <div className="cs-google-calendar-actions">
                <button type="button" onClick={runProbe} disabled={isLoading}>
                    {connectLabel}
                </button>
                <button type="button" onClick={runDisconnect} disabled={isLoading}>
                    {disconnectLabel}
                </button>
            </div>
            <div className="cs-google-calendar-actions">
                <button type="button" onClick={runEnsureCalendar} disabled={isLoading}>
                    {createCalendarLabel}
                </button>
                <button type="button" onClick={runCreateTestEvent} disabled={isLoading}>
                    {createTestEventLabel}
                </button>
                <button type="button" onClick={runSyncAssignments} disabled={isLoading}>
                    {syncAssignmentsLabel}
                </button>
            </div>
            <p className="cs-google-calendar-text">{syncTargetCount}</p>
            <p className="cs-google-calendar-text">{statusText}</p>
            {calendarPreview.length > 0 ? <p className="cs-google-calendar-text">{calendarPreview}</p> : null}
            {status === "error" ? (
                <p className="cs-google-calendar-text cs-google-calendar-error">
                    {statusErrorPrefix}: {errorText}
                </p>
            ) : null}
        </div>
    );
}
