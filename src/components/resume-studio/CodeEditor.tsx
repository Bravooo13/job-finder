"use client";

import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, type Ref } from "react";

const latexLanguage = StreamLanguage.define(stex);

/** LaTeX editor (CodeMirror) with ⌘S / Ctrl+S to compile. */
export default function CodeEditor({
  value,
  onChange,
  onSave,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  ref?: Ref<ReactCodeMirrorRef>;
}) {
  const { resolvedTheme } = useTheme();
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  const extensions = useMemo(
    () => [
      latexLanguage,
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              saveRef.current();
              return true;
            },
          },
        ]),
      ),
    ],
    [],
  );

  return (
    <CodeMirror
      ref={ref}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="cm-fill"
      height="100%"
      basicSetup={{ foldGutter: true, highlightActiveLine: true, autocompletion: false }}
      aria-label="LaTeX source"
    />
  );
}
