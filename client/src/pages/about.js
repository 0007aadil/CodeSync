import Head from 'next/head';
import Link from 'next/link';

export default function About() {
  return (
    <>
      <Head>
        <title>About CodeSync</title>
        <meta name="description" content="Learn more about CodeSync and its mission." />
      </Head>

      <div className="landing-page">
        <div className="landing-bg" />

        <nav className="landing-nav">
          <Link href="/" className="landing-nav-logo" style={{ textDecoration: 'none', color: 'inherit' }}>
            <svg className="landing-logo-svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="url(#lg)" />
              <path d="M7 8h10M7 12h6M7 16h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <defs><linearGradient id="lg" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#ff6363" /><stop offset="1" stopColor="#ffb347" /></linearGradient></defs>
            </svg>
            <span>CodeSync</span>
          </Link>
          <div className="landing-nav-links">
            <Link href="/about" className="landing-nav-link">About</Link>
            <Link href="/feedback" className="landing-nav-link">Feedback</Link>
            <a href="https://github.com/0007aadil/CodeSync" target="_blank" rel="noopener noreferrer" className="landing-nav-link">GitHub</a>
          </div>
        </nav>

        <div className="content-container">
          <div className="content-box">
            <h1 className="content-title">About <span className="gradient-text">CodeSync</span></h1>
            
            <section className="content-section">
              <h2>Our Mission</h2>
              <p>
                CodeSync is designed to remove the friction from collaborative programming. 
                Whether you're pair programming for an interview, debugging a complex issue with a colleague, 
                or teaching someone how to code, CodeSync provides a seamless, real-time environment with zero setup required.
              </p>
            </section>

            <section className="content-section">
              <h2>Core Features</h2>
              <ul className="content-list">
                <li><strong>Real-time Sync:</strong> Built on Yjs for conflict-free, sub-millisecond collaboration.</li>
                <li><strong>VS Code Experience:</strong> Powered by the Monaco Editor, bringing industry-standard syntax highlighting, auto-completion, and shortcuts to your browser.</li>
                <li><strong>Integrated Communication:</strong> Built-in voice and video chat powered by WebRTC so you never have to switch tabs.</li>
                <li><strong>Live Execution:</strong> Run Python, JavaScript, and TypeScript directly within your workspace and instantly see the output.</li>
              </ul>
            </section>

            <section className="content-section">
              <h2>Open Source</h2>
              <p>
                CodeSync is proudly open source. We believe in transparency and community-driven development.
                You can view our source code, contribute, or host your own instance via our GitHub repository.
              </p>
              <a href="https://github.com/0007aadil/CodeSync" className="btn-primary" style={{ display: 'inline-block', marginTop: '1rem', textDecoration: 'none' }}>
                View on GitHub
              </a>
            </section>
          </div>
        </div>

        <footer className="landing-footer">
          Built with <a href="https://yjs.dev" target="_blank" rel="noopener noreferrer">Yjs</a> · <a href="https://microsoft.github.io/monaco-editor/" target="_blank" rel="noopener noreferrer">Monaco</a> · <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer">Next.js</a>
        </footer>
      </div>
    </>
  );
}
