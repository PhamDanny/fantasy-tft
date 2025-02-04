import { useState, useEffect } from 'react';
import { useAuth } from '../firebase/auth';
import { updateProfile, updatePassword, User, sendEmailVerification, verifyBeforeUpdateEmail, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { useTheme } from '../contexts/ThemeContext';
import { Form, Button, Alert, Card, Modal } from 'react-bootstrap';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { sendPasswordResetEmail } from '../firebase/auth';

interface UserData {
  displayName: string;
  email: string;
  createdAt: string;
}

const UserSettings = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const { isDarkMode, toggleDarkMode } = useTheme();
  
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<{type: string; message: string} | null>(null);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [canResendVerification, setCanResendVerification] = useState(true);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [newEmail, setNewEmail] = useState('');
  const [verifyingNewEmail, setVerifyingNewEmail] = useState(false);
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [pendingAction, setPendingAction] = useState<'email' | 'password' | null>(null);

  useEffect(() => {
    const unsubscribe = useAuth(async (authUser) => {
      setUser(authUser);
      if (authUser) {
        setDisplayName(authUser.displayName || '');
        setEmail(authUser.email || '');
        
        // Fetch additional user data from Firestore
        try {
          const userDoc = await getDoc(doc(db, "users", authUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserData;
            setUserData(data);
          }
        } catch (err) {
          showAlert('danger', 'Error fetching user data');
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (verificationEmailSent && !canResendVerification) {
      const timer = setInterval(() => {
        setResendCountdown((prev) => {
          if (prev <= 1) {
            setCanResendVerification(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [verificationEmailSent, canResendVerification]);

  const showAlert = (type: string, message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      await updateProfile(user, { displayName });
      // Update Firestore document as well
      await updateDoc(doc(db, 'users', user.uid), {
        displayName
      });
      showAlert('success', 'Profile updated successfully');
    } catch (error: any) {
      showAlert('danger', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      await verifyBeforeUpdateEmail(user, newEmail);
      setVerifyingNewEmail(true);
      showAlert('success', 'Verification email sent to your new address. Please verify it before the change takes effect.');
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        setPendingAction('email');
        setShowReauthModal(true);
      } else {
        showAlert('danger', error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!user || newPassword !== confirmPassword) {
      showAlert('danger', 'Passwords do not match');
      return;
    }
    
    setIsLoading(true);
    try {
      await updatePassword(user, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      showAlert('success', 'Password updated successfully');
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        setPendingAction('password');
        setShowReauthModal(true);
      } else {
        showAlert('danger', error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendVerification = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      await sendEmailVerification(user);
      setVerificationEmailSent(true);
      setCanResendVerification(false);
      setResendCountdown(120); // 2 minutes
      showAlert('success', 'Verification email sent! Please check your inbox.');
    } catch (error: any) {
      showAlert('danger', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(user.email);
      showAlert('success', 'Password reset email sent! Please check your inbox.');
    } catch (error: any) {
      showAlert('danger', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReauthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const credential = EmailAuthProvider.credential(user!.email!, reauthPassword);
      await reauthenticateWithCredential(user!, credential);
      
      // Retry the pending action
      if (pendingAction === 'email') {
        await handleUpdateEmail();
      } else if (pendingAction === 'password') {
        await handleUpdatePassword();
      }
      
      setShowReauthModal(false);
      setReauthPassword('');
      setPendingAction(null);
    } catch (error: any) {
      showAlert('danger', 'Incorrect password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user || !userData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container py-4">
      <h1 className="mb-4">User Settings</h1>

      {alert && (
        <Alert variant={alert.type} onClose={() => setAlert(null)} dismissible>
          {alert.message}
        </Alert>
      )}

      <Card className="mb-4">
        <Card.Header>
          <h2 className="h5 mb-0">Profile Settings</h2>
        </Card.Header>
        <Card.Body>
          <Form.Group className="mb-3">
            <Form.Label>Display Name</Form.Label>
            <Form.Control
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Form.Group>
          <Button 
            variant="primary"
            onClick={handleUpdateProfile}
            disabled={isLoading}
          >
            Update Display Name
          </Button>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header>
          <h2 className="h5 mb-0">Email Verification</h2>
        </Card.Header>
        <Card.Body>
          {user?.emailVerified ? (
            <div className="d-flex align-items-center text-success">
              <i className="bi bi-check-circle me-2"></i>
              Your email is verified
            </div>
          ) : (
            <div>
              <div className="alert alert-warning">
                Your email is not verified. Some features require a verified email address.
              </div>
              <Button 
                variant="primary"
                onClick={handleSendVerification}
                disabled={isLoading || !canResendVerification}
              >
                {isLoading ? 'Sending...' : 
                  !canResendVerification 
                    ? `Resend available in ${resendCountdown}s` 
                    : verificationEmailSent 
                      ? 'Resend Verification Email' 
                      : 'Send Verification Email'}
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header>
          <h2 className="h5 mb-0">Email Settings</h2>
        </Card.Header>
        <Card.Body>
          {!user?.emailVerified && (
            <div className="alert alert-warning mb-3">
              Email verification required to change email address
            </div>
          )}
          <div className="mb-3">
            <Form.Label>Current Email</Form.Label>
            <Form.Control
              type="email"
              value={email}
              disabled={true}
            />
          </div>
          <div className="mb-3">
            <Form.Label>New Email</Form.Label>
            <Form.Control
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={!user?.emailVerified || verifyingNewEmail}
            />
          </div>
          {verifyingNewEmail ? (
            <div className="alert alert-info">
              Please check your new email address and verify it to complete the change.
            </div>
          ) : (
            <Button 
              variant="primary"
              onClick={handleUpdateEmail}
              disabled={isLoading || !user?.emailVerified || !newEmail || newEmail === email}
            >
              Update Email
            </Button>
          )}
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header>
          <h2 className="h5 mb-0">Password Settings</h2>
        </Card.Header>
        <Card.Body>
          {!user?.emailVerified && (
            <div className="alert alert-warning mb-3">
              Email verification required to change password
            </div>
          )}
          <Form.Group className="mb-3">
            <Form.Label>New Password</Form.Label>
            <Form.Control
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={!user?.emailVerified}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Confirm Password</Form.Label>
            <Form.Control
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={!user?.emailVerified}
            />
          </Form.Group>
          <Button 
            variant="primary"
            onClick={handleUpdatePassword}
            disabled={isLoading || !user?.emailVerified}
          >
            Update Password
          </Button>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header>
          <h2 className="h5 mb-0">Forgot Password</h2>
        </Card.Header>
        <Card.Body>
          <Button 
            variant="primary"
            onClick={handleSendPasswordReset}
            disabled={isLoading}
          >
            {isLoading ? 'Sending...' : 'Send Password Reset Email'}
          </Button>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <h2 className="h5 mb-0">Appearance</h2>
        </Card.Header>
        <Card.Body>
          <Form.Check 
            type="switch"
            id="dark-mode-switch"
            label="Dark Mode"
            checked={isDarkMode}
            onChange={toggleDarkMode}
          />
        </Card.Body>
      </Card>

      {/* Re-authentication Modal */}
      <Modal show={showReauthModal} onHide={() => setShowReauthModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Your Identity</Modal.Title>
        </Modal.Header>
        <form onSubmit={handleReauthenticate}>
          <Modal.Body>
            <p>For security reasons, please enter your password to continue.</p>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                required
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowReauthModal(false)}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? 'Verifying...' : 'Confirm'}
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </div>
  );
};

export default UserSettings;
