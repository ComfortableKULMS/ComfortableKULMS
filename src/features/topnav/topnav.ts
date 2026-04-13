// features/topnav.ts
import { Settings } from "../setting/types";

export function createKulmsTopNav(settings: Settings) {
    // 【重要】もし設定がOFFなら、タブを消してここで処理を終わる
    if (!settings.miniSakaiOption.showTopNavLink) {
        document.querySelectorAll('.custom-kulms-tab-wrapper').forEach(el => el.remove());
        return;
    }
    // 重複防止：既に作られている場合は削除
    document.querySelectorAll('.custom-kulms-tab-wrapper').forEach(el => el.remove());

    const kulmsPinnedSites = document.querySelectorAll('#pinned-site-list > li.site-list-item');
    if (kulmsPinnedSites.length === 0) return;

    const breadcrumb = document.querySelector('ol.breadcrumb');
    if (!breadcrumb) return;

    const wrapper = document.createElement('span');
    wrapper.className = 'custom-kulms-tab-wrapper';

    kulmsPinnedSites.forEach(site => {
        const kulmsLink = site.querySelector('a.sidebar-site-title') as HTMLAnchorElement;
        const siteId = site.getAttribute('data-site'); // 左メニューが持っているサイトIDを取得
        
        if (kulmsLink && siteId) {
            const a = document.createElement('a');
            a.href = kulmsLink.href;
            a.title = kulmsLink.title;
            a.textContent = kulmsLink.textContent;
            a.className = 'Mrphs-hierarchy-item ui-priority-secondary custom-kulms-tab';
            
            // ▼【重要】favoritesBar.tsで判定できるようにサイトIDをセットする
            a.dataset.site = siteId;

            if (site.classList.contains('is-current-site')) {
                a.classList.add('custom-tab-active');
            }

            wrapper.appendChild(a);
        }
    });

    // 挿入位置の決定
    const manageBtn = breadcrumb.querySelector('.manage-overview-link');
    if (manageBtn) {
        manageBtn.classList.remove('d-lg-block'); // 強制改行を解除
        manageBtn.after(wrapper);
    } else {
        breadcrumb.appendChild(wrapper);
    }
}