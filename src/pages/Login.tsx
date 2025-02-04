import React, { useState } from "react";
import { signIn, signUp, createUserDocument, sendPasswordResetEmail } from "../firebase/auth";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "../firebase/config";

export const Login = () => {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (isSignUp) {
        await signUp(email, password, displayName);
        navigate("/");
      } else if (needsSetup) {
        // Complete account setup
        await createUserDocument(auth.currentUser!.uid, email, displayName);
        navigate("/");
      } else {
        try {
          await signIn(email, password);
          navigate("/");
        } catch (err: any) {
          if (err.name === 'AccountSetupNeeded') {
            setNeedsSetup(true);
            setError("There was an error creating your account. Please re-enter a display name to complete setup.");
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) {
        setIsSignUp(false);
      }
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsResetting(true);

    try {
      await sendPasswordResetEmail(resetEmail);
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="card mt-4">
      <div className="card-header">
        <h2 className="mb-0">
          {resetSent ? "Check Your Email"
            : needsSetup ? "Complete Account Setup"
            : isSignUp ? "Sign Up"
            : "Login"}
        </h2>
      </div>

      <div className="card-body">
        {resetSent ? (
          <div>
            <div className="alert alert-success">
              Password reset instructions have been sent to your email.
            </div>
            <button
              onClick={() => {
                setResetSent(false);
                setResetEmail("");
              }}
              className="btn btn-primary w-100"
            >
              Back to Login
            </button>
          </div>
        ) : isSignUp || needsSetup ? (
          <form onSubmit={handleSubmit}>
            {(isSignUp || needsSetup) && (
              <div className="mb-3">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="form-control"
                  required
                />
              </div>
            )}

            {!needsSetup && (
              <>
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-control"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-control"
                    required
                  />
                </div>
              </>
            )}

            {error && <div className="alert alert-danger">{error}</div>}

            <button type="submit" className="btn btn-primary w-100">
              {needsSetup ? "Complete Setup" : isSignUp ? "Sign Up" : "Login"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-control"
                required
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control"
                required
              />
              <button
                type="button"
                onClick={() => setResetEmail(email)}
                className="btn btn-link p-0 mt-1"
                data-bs-toggle="modal"
                data-bs-target="#resetPasswordModal"
              >
                Forgot Password?
              </button>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <button type="submit" className="btn btn-primary w-100">
              Login
            </button>
          </form>
        )}

        {!needsSetup && !resetSent && (
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="btn btn-link w-100 mt-3"
          >
            {isSignUp
              ? "Already have an account? Login"
              : "Need an account? Sign Up"}
          </button>
        )}
      </div>

      {/* Password Reset Modal */}
      <div className="modal fade" id="resetPasswordModal" tabIndex={-1}>
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Reset Password</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isResetting}
                >
                  {isResetting ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login; 