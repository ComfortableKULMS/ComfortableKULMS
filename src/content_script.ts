import { saveHostName } from "./features/storage";
import { createMiniSakai, createMiniSakaiBtn } from "./minisakai";
import { isLoggedIn, miniSakaiReady } from "./utils";
import submitDetect from "./features/submitDetect";
// Example in a content script file (e.g., content.ts or part of your main extension logic)
import { injectPdfThumbnails, injectThumbnailsToOngoingAssignment } from './thumbnails';
import { createKulmsTopNav } from "./features/topnav/topnav";
import { getStoredSettings } from "./features/setting/getSetting";
import { handleCollapseHome } from "./features/homeClose/homeClose";

async function main() {
    if (isLoggedIn()) {
        createMiniSakaiBtn();
        const hostname = window.location.hostname;
        createMiniSakai(hostname);

        miniSakaiReady();
        await saveHostName(hostname);
        submitDetect(hostname);
        const settings = await getStoredSettings(hostname); 
        createKulmsTopNav(settings);
        handleCollapseHome(settings);
        injectPdfThumbnails();
        injectThumbnailsToOngoingAssignment();
    }
}

main();
