import React from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Draft } from '../types';

interface DraftOrderManagerProps {
  draft: Draft;
  isCommissioner: boolean;
}

const DraftOrderManager: React.FC<DraftOrderManagerProps> = ({
  draft,
  isCommissioner,
}) => {
  const handleRandomize = async () => {
    // Fisher-Yates shuffle algorithm
    const shuffle = (array: string[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    try {
      const newOrder = shuffle([...draft.settings.draftOrder]);
      await updateDoc(doc(db, 'drafts', draft.id), {
        'settings.draftOrder': newOrder,
      });
    } catch (error) {
      console.error('Failed to randomize draft order:', error);
    }
  };

  return (
    <div className="card mb-4">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">Draft Order</h5>
        {isCommissioner && draft.status === 'pending' && (
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={handleRandomize}
          >
            Randomize Order
          </button>
        )}
      </div>
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-bordered mb-0">
            <thead>
              <tr>
                <th>Position</th>
                <th>Team</th>
              </tr>
            </thead>
            <tbody>
              {draft.settings.draftOrder.map((teamId, index) => (
                <tr key={teamId}>
                  <td>{index + 1}</td>
                  <td>{draft.teams[teamId]?.teamName || 'Unknown Team'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DraftOrderManager; 