import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../firebase/auth';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Draft } from '../types';
import ConvertDraftToLeagueDialog from '../components/dialogs/ConvertDraftToLeagueDialog';

const MyDrafts = () => {
  const [user, setUser] = useState<any>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadDrafts = async (authUser: any) => {
    if (!authUser) return;
    try {
      const draftsRef = collection(db, 'drafts');
      const q = query(draftsRef, where('commissioner', '==', authUser.uid));
      const querySnapshot = await getDocs(q);
      
      const userDrafts: Draft[] = [];
      querySnapshot.forEach((doc) => {
        userDrafts.push({ id: doc.id, ...doc.data() } as Draft);
      });
      
      setDrafts(userDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch drafts');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDraft = async (draftId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent navigation when clicking delete
    if (!window.confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'drafts', draftId));
      // Refresh the drafts list
      if (user) {
        loadDrafts(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete draft');
    }
  };

  const handleDraftConverted = async (draftId: string) => {
    try {
      // Delete the draft after successful conversion
      await deleteDoc(doc(db, 'drafts', draftId));
      // Refresh the drafts list
      if (user) {
        loadDrafts(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete draft after conversion');
    }
  };

  useEffect(() => {
    const unsubscribe = useAuth(async (authUser) => {
      setUser(authUser);
      if (authUser) {
        loadDrafts(authUser);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-danger">Error: {error}</div>;
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Drafts</h2>
      </div>

      <div className="alert alert-warning mb-4">
        <strong>Notice:</strong> The standalone draft system is being phased out and being built into the League creation process. For new leagues, please use the{' '}
        <a href="/leagues" className="alert-link">Leagues</a> section to create a league directly. This will provide a much better experience than converting drafts into a League.
        Existing drafts can still be converted, but there are no guarantees that it will work perfectly.
      </div>

      {!user ? (
        // Show welcome banner for non-authenticated users
        <div className="alert alert-info mb-4 d-flex justify-content-between align-items-center">
          <div>
            <strong>Want to start a league?</strong> Sign up to create your own league!
          </div>
          <a href="/login?mode=signup" className="btn btn-primary btn-sm">
            Sign Up Now
          </a>
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-muted mb-4">
            You haven't created any drafts yet. We recommend creating a new league instead!
          </p>
          <a href="/leagues" className="btn btn-primary">
            Go to Leagues
          </a>
        </div>
      ) : (
        <>
          <div className="list-group mb-4">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="list-group-item list-group-item-action"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/drafts/${draft.id}`)}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h5 className="mb-1">{draft.name}</h5>
                    <small className="text-muted">
                      {draft.status === 'pending' ? 'Not Started' :
                       draft.status === 'in_progress' ? 'In Progress' :
                       'Completed'}
                    </small>
                  </div>
                  <div className="d-flex align-items-center gap-3">
                    <div className="text-end">
                      <small className="d-block">{draft.season}</small>
                      <small className="text-muted">
                        {Object.keys(draft.teams).length}/{draft.settings.teamsLimit} Teams
                      </small>
                    </div>
                    <div className="d-flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {draft.status === 'completed' && (
                        <ConvertDraftToLeagueDialog
                          draft={draft}
                          onLeagueCreated={(leagueId) => {
                            handleDraftConverted(draft.id);
                            navigate(`/leagues/${leagueId}`);
                          }}
                        />
                      )}
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={(e) => handleDeleteDraft(draft.id, e)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-muted mb-3">
              Need to create a new league? Head over to the Leagues section!
            </p>
            <a href="/leagues" className="btn btn-primary">
              Go to Leagues
            </a>
          </div>
        </>
      )}
    </div>
  );
};

export default MyDrafts;
