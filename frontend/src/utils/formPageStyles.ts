// class Tailwind cho khung trang Create + Edit (2 trang cùng bố cục)
// max-[901px]: = màn hình <= 900px (tablet/mobile)
export const page = {
    main: "flex grow flex-col gap-[18px] bg-bg px-12 pt-6 pb-[34px] max-[901px]:p-[18px]",
    topRow: "flex items-center justify-between gap-5",
    breadcrumb: "flex items-center gap-2 text-[12.5px] text-muted",
    breadcrumbLink: "font-sans font-semibold text-accent no-underline",
    breadcrumbCurrent: "font-medium text-ink",
    apiBadge: "rounded-badge bg-chip px-2.5 py-1 font-mono text-[11.5px] text-muted",
    titleRow: "flex items-center justify-between gap-5",
    title: "text-[38px] leading-none",
    actions: "flex items-center gap-[11px]",
    footnote: "text-[11.5px] text-muted",
};
