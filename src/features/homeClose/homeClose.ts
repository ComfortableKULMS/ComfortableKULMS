import { Settings } from "../setting/types";

/**
 * サイドバーのHomeを開閉し、アイコンの向きも正しく制御する処理
 */
export const handleCollapseHome = (settings: Settings) => {
    // 1. Homeのリスト（IDが home-site- で始まるもの）を探す
    const homeCollapse = document.querySelector('.site-list-item-collapse[id^="home-site"]');
    if (!homeCollapse) return;

    const shouldCollapse = settings.miniSakaiOption.collapseHome;
    // 2. 対応するボタンを探す
    const homeBtn = document.querySelector(`button[data-bs-target="#${homeCollapse.id}"]`);
    // 3. ボタンの中にあるアイコン（矢印）を探す
    const icon = homeBtn?.querySelector('i');

    if (shouldCollapse) {
        // --- 閉じる処理 ---
        homeCollapse.classList.remove('show');
        if (homeBtn) {
            homeBtn.setAttribute('aria-expanded', 'false');
            homeBtn.classList.add('collapsed');
        }
        // アイコンを右向きに変更
        if (icon) {
            icon.classList.remove('bi-chevron-down');
            icon.classList.add('bi-chevron-right');
        }
    } else {
        // --- 開く処理 ---
        homeCollapse.classList.add('show');
        if (homeBtn) {
            homeBtn.setAttribute('aria-expanded', 'true');
            homeBtn.classList.remove('collapsed');
        }
        // アイコンを下向きに戻す
        if (icon) {
            icon.classList.remove('bi-chevron-right');
            icon.classList.add('bi-chevron-down');
        }
    }
};