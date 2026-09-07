import { useState } from "react";

const EXAMPLES = [
  { icon: "🎧", label: "800 元以内通勤降噪耳机" },
  { icon: "🥾", label: "500 元以内轻量登山杖" },
  { icon: "🏕️", label: "适合露营的长续航灯" },
  { icon: "🎒", label: "预算 1000 元的旅行背包" },
];

/** 空状态：还没有对话时展示。点击只能填入输入框，不自动发送。 */
export default function WelcomeState({ onPick }: { onPick: (text: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="welcome">
      <div className="welcome-title">
        <span className="welcome-mark" aria-hidden="true">
          ✦
        </span>
        今天想买什么？
      </div>
      <p className="welcome-sub">挑一个试试，或直接告诉我你的需求。</p>
      <div className="prompt-list">
        {EXAMPLES.map((ex) => {
          const selected = picked === ex.label;
          return (
            <button
              key={ex.label}
              type="button"
              className={`quick-prompt${selected ? " is-picked" : ""}`}
              onClick={() => {
                setPicked(ex.label);
                onPick(ex.label);
              }}
            >
              <span className="quick-icon" aria-hidden="true">
                {ex.icon}
              </span>
              <span>{ex.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
