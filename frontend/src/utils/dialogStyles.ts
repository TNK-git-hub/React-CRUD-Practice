// class Tailwind cho <dialog> xác nhận, dùng chung: ConfirmDeleteDialog + LeaveConfirmDialog
export const dialog = {
    // padding để ở body -> bấm vào nền tối (backdrop) mới nhận ra đúng
    box: "m-auto w-[min(420px,calc(100vw-32px))] rounded-panel border border-line bg-surface p-0 text-ink backdrop:bg-[rgba(0,0,0,0.4)]",
    body: "flex flex-col gap-3 p-6",
    title: "text-[18px]",
    text: "leading-normal text-muted",
    actions: "mt-2 flex justify-end gap-2",
};
