import { useState } from "react";
import { Editor } from "@hugerte/hugerte-react";
import hugerte from "hugerte";
import "hugerte/models/dom";
import "hugerte/themes/silver";
import "hugerte/icons/default";
import "hugerte/skins/ui/oxide/skin.js";
import "hugerte/skins/ui/oxide/content.js";
import "hugerte/skins/content/default/content.js";
import "hugerte/plugins/advlist";
import "hugerte/plugins/autolink";
import "hugerte/plugins/lists";
import "hugerte/plugins/link";
import "hugerte/plugins/image";
import "hugerte/plugins/table";
import "hugerte/plugins/charmap";
import "hugerte/plugins/code";
import "hugerte/plugins/help";

const TOOLBAR = [
  "undo redo",
  "styles",
  "lineheight",
  "forecolor backcolor",
  "bold italic underline",
  "alignleft aligncenter alignright",
  "bullist numlist",
  "outdent indent",
  "link image table charmap",
  "code",
].join(" | ");

(window as Window & { hugerte?: typeof hugerte }).hugerte = hugerte;

export function HtmlEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (html: string) => void;
}) {
  const [source, setSource] = useState(false);
  const [seed, setSeed] = useState(value);

  function toggleSource() {
    if (source) setSeed(value);
    setSource(current => !current);
  }

  return (
    <div className="brand-html-editor">
      <div className="brand-html-editor-heading">
        <span id={`${id}-label`}>Description</span>
        <button type="button" onClick={toggleSource}>
          Show / Hide Editor
        </button>
      </div>
      {source ? (
        <textarea
          id={id}
          className="brand-html-source"
          aria-labelledby={`${id}-label`}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
      ) : (
        <Editor
          id={id}
          initialValue={seed}
          onEditorChange={onChange}
          init={{
            height: 480,
            menubar: false,
            branding: true,
            promotion: false,
            statusbar: true,
            plugins: ["advlist", "autolink", "lists", "link", "image", "table", "charmap", "code", "help"],
            toolbar: TOOLBAR,
            skin_url: "default",
            content_css: "default",
            convert_urls: false,
            relative_urls: false,
          }}
        />
      )}
      <span className="field-hint">HTML is stored as entered.</span>
    </div>
  );
}
