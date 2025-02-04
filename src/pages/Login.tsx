import React, { useState } from "react";
import { signIn, signUp, createUserDocument } from "../firebase/auth";
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
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (isSignUp) {
        await signUp(email, password, displayName);
        navigate("/leagues");
      } else if (needsSetup) {
        // Complete account setup
        await createUserDocument(auth.currentUser!.uid, email, displayName);
        navigate("/leagues");
      } else {
        try {
          await signIn(email, password);
          navigate("/leagues");
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

  return (
    <div className="card mt-4">
      <div className="card-header">
        <h2 className="mb-0">
          {needsSetup ? "Complete Account Setup" : isSignUp ? "Sign Up" : "Login"}
        </h2>
      </div>

      <div className="card-body">
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

        {!needsSetup && (
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
    </div>
  );
};

export default Login; 