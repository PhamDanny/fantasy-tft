import React, { useState } from 'react';
import { collection, query, where, getDocs, writeBatch, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { League } from '../types';
import { doc } from 'firebase/firestore';

interface AdminCupPanelProps {
  isVisible: boolean;
  user: any;
}

const AdminCupPanel: React.FC<AdminCupPanelProps> = ({ isVisible, user }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState("Set 13");
  const [selectedCup, setSelectedCup] = useState<number>(1);

  if (!isVisible) return null;

  const handleUpdateCups = async () => {
    if (!window.confirm(`Are you sure you want to set all ${selectedSet} leagues to Cup ${selectedCup}?`)) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Query all leagues for the selected set
      const leaguesRef = collection(db, 'leagues');
      const q = query(leaguesRef, where('season', '==', selectedSet));
      const querySnapshot = await getDocs(q);

      // Use batched writes to update all leagues
      const batch = writeBatch(db);
      let updateCount = 0;

      querySnapshot.forEach((doc) => {
        const league = doc.data() as League;
        
        // Skip completed leagues
        if (league.phase === 'completed') return;

        // Update the cup number
        batch.update(doc.ref, {
          'settings.currentCup': selectedCup,
          // If moving to cup 1, set phase to in_season
          // If moving to playoffs cup (4), set phase to playoffs
          phase: selectedCup === 0 ? 'drafting' 
               : selectedCup === 4 ? 'playoffs'
               : 'in_season'
        });
        updateCount++;
      });

      await batch.commit();
      setSuccess(`Successfully updated ${updateCount} leagues to Cup ${selectedCup}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update leagues');
    } finally {
      setLoading(false);
    }
  };

  const handleAdvanceCup = async () => {
    if (!window.confirm('Are you sure you want to advance to the next cup?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const batch = writeBatch(db);
      
      // First update global settings
      const globalSettingsRef = doc(db, 'globalSettings', 'currentCup');
      const globalSettingsDoc = await getDoc(globalSettingsRef);
      const newCup = (user.currentCup || 1) + 1;

      // Create or update the global settings document
      if (!globalSettingsDoc.exists()) {
        await setDoc(globalSettingsRef, {
          currentCup: newCup,
          updatedAt: new Date().toISOString(),
          updatedBy: user.uid
        });
      } else {
        batch.update(globalSettingsRef, {
          currentCup: newCup,
          updatedAt: new Date().toISOString(),
          updatedBy: user.uid
        });
      }

      // Only update season-long leagues
      const leaguesRef = collection(db, 'leagues');
      const activeLeaguesQuery = query(
        leaguesRef, 
        where('phase', 'in', ['drafting', 'in_season']),
        where('type', '==', 'season-long')  // Only get season-long leagues
      );
      
      const leaguesSnapshot = await getDocs(activeLeaguesQuery);
      leaguesSnapshot.forEach((leagueDoc) => {
        batch.update(leagueDoc.ref, {
          'settings.currentCup': newCup
        });
      });

      await batch.commit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance cup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <h4 className="h5 mb-0">Admin Controls: Cup Management</h4>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Set</label>
            <select 
              className="form-select"
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
              disabled={loading}
            >
              <option value="Set 13">Set 13</option>
              <option value="Set 14">Set 14</option>
              <option value="Set 15">Set 15</option>
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label">Cup</label>
            <select
              className="form-select"
              value={selectedCup}
              onChange={(e) => setSelectedCup(parseInt(e.target.value))}
              disabled={loading}
            >
              <option value={0}>Preseason</option>
              <option value={1}>Cup 1</option>
              <option value={2}>Cup 2</option>
              <option value={3}>Cup 3</option>
              <option value={4}>Playoffs</option>
            </select>
          </div>

          <div className="col-md-4 d-flex align-items-end">
            <button
              className="btn btn-warning w-100"
              onClick={handleUpdateCups}
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update All Leagues'}
            </button>
          </div>
        </div>

        <div className="alert alert-info mt-3">
          <strong>Note:</strong> This will update all {selectedSet} leagues to Cup {selectedCup}. 
          Completed leagues will not be affected.
        </div>

        <div className="mt-3">
          <p>Current Cup: {user?.currentCup || 1}</p>
          <button 
            className="btn btn-warning"
            onClick={handleAdvanceCup}
            disabled={loading || (user?.currentCup || 1) >= 3}
          >
            {loading ? 'Advancing...' : `Advance to Cup ${(user?.currentCup || 1) + 1}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminCupPanel; 