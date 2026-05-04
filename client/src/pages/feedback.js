import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Feedback() {
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    
    try {
      // Send silently via FormSubmit API
      await fetch("https://formsubmit.co/ajax/aadilahsan007@gmail.com", {
        method: "POST",
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            _subject: "New CodeSync Feedback!",
            email: email || "Not provided",
            feedback: feedback
        })
      });

      // Show success state
      setSubmitted(true);
      setFeedback('');
      setEmail('');
    } catch (error) {
      console.error("Failed to send feedback", error);
      alert("Failed to send feedback. Please try again.");
    }
  };

  return (
    <>
      <Head>
        <title>Feedback — CodeSync</title>
        <meta name="description" content="Share your feedback to help us improve CodeSync." />
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
            <Link href="/feedback" className="landing-nav-link active">Feedback</Link>
            <a href="https://github.com/0007aadil/CodeSync" target="_blank" rel="noopener noreferrer" className="landing-nav-link">GitHub</a>
          </div>
        </nav>

        <div className="content-container">
          <div className="content-box">
            <h1 className="content-title">Share Your <span className="gradient-text">Feedback</span></h1>
            
            <p className="content-subtitle">
              We're constantly working to improve CodeSync. Let us know what features you'd like to see,
              bugs you've encountered, or general thoughts on the experience!
            </p>

            {submitted ? (
              <div className="feedback-success">
                <div className="success-icon">✓</div>
                <h3>Thank you!</h3>
                <p>Your feedback has been received. We appreciate your input!</p>
                <button className="btn-primary mt-4" onClick={() => setSubmitted(false)}>
                  Send more feedback
                </button>
              </div>
            ) : (
              <form className="feedback-form" onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="email">Email address (optional)</label>
                  <input
                    id="email"
                    type="email"
                    className="input-field"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <span className="form-hint">So we can follow up with you if needed.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="feedback">Your feedback</label>
                  <textarea
                    id="feedback"
                    className="input-field textarea-field"
                    placeholder="Tell us what you think..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={6}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={!feedback.trim()}>
                  Submit Feedback
                </button>
              </form>
            )}
          </div>
        </div>

        <footer className="landing-footer">
          Built with <a href="https://yjs.dev" target="_blank" rel="noopener noreferrer">Yjs</a> · <a href="https://microsoft.github.io/monaco-editor/" target="_blank" rel="noopener noreferrer">Monaco</a> · <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer">Next.js</a>
        </footer>
      </div>
    </>
  );
}
