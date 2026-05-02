import { useRef, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import Monaco to avoid SSR issues
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.default),
  { ssr: false, loading: () => <div className="editor-loading"><div className="loading-spinner"></div><div className="loading-text">Loading editor...</div></div> }
);

/**
 * CollabEditor component
 * Wraps Monaco Editor with Yjs CRDT binding for real-time collaboration
 */
export default function CollabEditor({ language, onEditorReady, theme }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom dark theme matching our design system
    monaco.editor.defineTheme('collab-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '555555', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff6363' },
        { token: 'string', foreground: '7ec699' },
        { token: 'number', foreground: 'ffb347' },
        { token: 'type', foreground: 'e8a0ff' },
        { token: 'function', foreground: '7ec8e3' },
        { token: 'variable', foreground: 'ececec' },
        { token: 'operator', foreground: 'ff9f7f' },
        { token: 'delimiter', foreground: '666666' },
        { token: 'tag', foreground: 'ff6363' },
        { token: 'attribute.name', foreground: 'ffb347' },
        { token: 'attribute.value', foreground: '7ec699' },
      ],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#ececec',
        'editor.lineHighlightBackground': '#0a0a0a',
        'editor.selectionBackground': '#ff636322',
        'editor.inactiveSelectionBackground': '#ff636311',
        'editorLineNumber.foreground': '#333333',
        'editorLineNumber.activeForeground': '#666666',
        'editorCursor.foreground': '#ff6363',
        'editor.selectionHighlightBackground': '#ff636311',
        'editorIndentGuide.background': '#1a1a1a',
        'editorIndentGuide.activeBackground': '#2a2a2a',
        'editorBracketMatch.background': '#ff636322',
        'editorBracketMatch.border': '#ff636344',
        'editorGutter.background': '#000000',
        'editorWidget.background': '#111111',
        'editorWidget.border': '#1a1a1a',
        'editorSuggestWidget.background': '#111111',
        'editorSuggestWidget.border': '#1a1a1a',
        'editorSuggestWidget.selectedBackground': '#1a1a1a',
        'scrollbarSlider.background': '#ffffff08',
        'scrollbarSlider.hoverBackground': '#ffffff15',
        'scrollbarSlider.activeBackground': '#ffffff20',
        'minimap.background': '#000000',
      },
    });

    monaco.editor.setTheme('collab-dark');

    // Configure editor options
    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontLigatures: true,
      lineHeight: 22,
      minimap: { enabled: true, scale: 1, renderCharacters: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      padding: { top: 16, bottom: 16 },
      suggest: { showIcons: true },
      automaticLayout: true,
    });

    setIsLoaded(true);

    // Notify parent that editor is ready
    if (onEditorReady) {
      onEditorReady(editor, monaco);
    }
  }, [onEditorReady]);

  return (
    <div className="editor-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MonacoEditor
        height="100%"
        language={language || 'javascript'}
        defaultValue=""
        onMount={handleEditorDidMount}
        options={{
          theme: 'vs-dark', // Will be overridden by custom theme on mount
        }}
      />
    </div>
  );
}
