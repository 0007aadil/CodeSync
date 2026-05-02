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
        { token: 'comment', foreground: '5a6578', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'cc5de8' },
        { token: 'string', foreground: '51cf66' },
        { token: 'number', foreground: 'fcc419' },
        { token: 'type', foreground: '339af0' },
        { token: 'function', foreground: '22b8cf' },
        { token: 'variable', foreground: 'e8ecf4' },
        { token: 'operator', foreground: 'ff922b' },
        { token: 'delimiter', foreground: '8892a4' },
        { token: 'tag', foreground: 'ff6b6b' },
        { token: 'attribute.name', foreground: 'fcc419' },
        { token: 'attribute.value', foreground: '51cf66' },
      ],
      colors: {
        'editor.background': '#0a0e17',
        'editor.foreground': '#e8ecf4',
        'editor.lineHighlightBackground': '#141c2b',
        'editor.selectionBackground': '#6c5ce733',
        'editor.inactiveSelectionBackground': '#6c5ce71a',
        'editorLineNumber.foreground': '#3a4558',
        'editorLineNumber.activeForeground': '#8892a4',
        'editorCursor.foreground': '#6c5ce7',
        'editor.selectionHighlightBackground': '#6c5ce71a',
        'editorIndentGuide.background': '#1e2a3f',
        'editorIndentGuide.activeBackground': '#2a3a52',
        'editorBracketMatch.background': '#6c5ce733',
        'editorBracketMatch.border': '#6c5ce766',
        'editorGutter.background': '#0a0e17',
        'editorWidget.background': '#141c2b',
        'editorWidget.border': '#1e2a3f',
        'editorSuggestWidget.background': '#141c2b',
        'editorSuggestWidget.border': '#1e2a3f',
        'editorSuggestWidget.selectedBackground': '#1e2a3f',
        'scrollbarSlider.background': '#ffffff15',
        'scrollbarSlider.hoverBackground': '#ffffff25',
        'scrollbarSlider.activeBackground': '#ffffff30',
        'minimap.background': '#0a0e17',
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
