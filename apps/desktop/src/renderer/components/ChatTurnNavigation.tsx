import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useTranslation } from "react-i18next";
import type { Message } from "@codeteams/shared";

export const chatTurnAnchorId = (id: string) => `chat-turn-${id}`;

/** A quiet outline of user turns, anchored to the transcript's own scrollport. */
export const ChatTurnNavigation: React.FC<{
  messages: Message[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onNavigate: () => void;
}> = ({ messages, scrollRef, onNavigate }) => {
  const { t } = useTranslation();
  const turns = useMemo(() => messages.filter(message => message.role === "user"), [messages]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const scrollport = scrollRef.current;
    if (!scrollport || turns.length < 2) return;
    let frame = 0;
    let offsets: Array<{ id: string; top: number }> = [];
    const updateActive = () => {
      if (!offsets.length) return;
      const atEnd = scrollport.scrollHeight - scrollport.clientHeight - scrollport.scrollTop <= 2;
      const readingLine = scrollport.scrollTop + Math.min(96, scrollport.clientHeight * 0.25);
      let low = 0;
      let high = offsets.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (offsets[mid]!.top <= readingLine) low = mid;
        else high = mid - 1;
      }
      setActiveId(offsets[atEnd ? offsets.length - 1 : low]!.id);
    };
    const measure = () => {
      frame = 0;
      const top = scrollport.getBoundingClientRect().top;
      offsets = turns.flatMap(turn => {
        const anchor = document.getElementById(chatTurnAnchorId(turn.id));
        return anchor && scrollport.contains(anchor)
          ? [{ id: turn.id, top: anchor.getBoundingClientRect().top - top + scrollport.scrollTop }]
          : [];
      });
      setScrollable(scrollport.scrollHeight > scrollport.clientHeight + 2);
      updateActive();
    };
    const scheduleMeasure = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(scheduleMeasure);
    resize.observe(scrollport);
    const content = scrollport.querySelector("[data-chat-transcript-content]");
    if (content) resize.observe(content);
    scrollport.addEventListener("scroll", updateActive, { passive: true });
    scheduleMeasure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      scrollport.removeEventListener("scroll", updateActive);
    };
  }, [turns, scrollRef]);

  useEffect(() => {
    const list = listRef.current;
    const button = activeId ? buttons.current.get(activeId) : undefined;
    if (!list || !button) return;
    if (button.offsetTop < list.scrollTop) list.scrollTop = button.offsetTop;
    else if (button.offsetTop + button.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = button.offsetTop + button.offsetHeight - list.clientHeight;
    }
  }, [activeId, scrollable]);

  if (turns.length < 2 || !scrollable) return null;

  const jump = (id: string) => {
    const scrollport = scrollRef.current;
    const anchor = document.getElementById(chatTurnAnchorId(id));
    if (!scrollport || !anchor) return;
    onNavigate();
    scrollport.scrollTo({
      top: anchor.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop - 20,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <nav className="ct-chat-turn-navigation" aria-label={t("chat.turnNavigation")}>
      <Tooltip.Provider delayDuration={250}>
        <div ref={listRef} className="ct-chat-turn-navigation-list">
          {turns.map((turn, index) => {
            const preview = turn.content.replace(/\s+/g, " ").trim().slice(0, 180);
            return (
              <Tooltip.Root key={turn.id}>
                <Tooltip.Trigger asChild>
                  <button
                    ref={button => { if (button) buttons.current.set(turn.id, button); else buttons.current.delete(turn.id); }}
                    type="button"
                    className="ct-chat-turn-tick"
                    aria-label={t("chat.jumpToTurn", { number: index + 1, text: preview })}
                    aria-controls={chatTurnAnchorId(turn.id)}
                    aria-current={activeId === turn.id ? "location" : undefined}
                    tabIndex={activeId === turn.id ? 0 : -1}
                    onClick={() => jump(turn.id)}
                    onKeyDown={event => {
                      const next = event.key === "ArrowUp" ? Math.max(0, index - 1)
                        : event.key === "ArrowDown" ? Math.min(turns.length - 1, index + 1)
                        : event.key === "Home" ? 0 : event.key === "End" ? turns.length - 1 : null;
                      if (next === null) return;
                      event.preventDefault();
                      buttons.current.get(turns[next]!.id)?.focus();
                    }}
                  ><span aria-hidden="true" /></button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content side="left" sideOffset={10} className="ct-chat-turn-preview" collisionPadding={12}>
                    <span>{t("chat.turnNumber", { number: index + 1 })}</span>
                    <p>{preview || t("chat.emptyTurnPreview")}</p>
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}
        </div>
      </Tooltip.Provider>
    </nav>
  );
};
