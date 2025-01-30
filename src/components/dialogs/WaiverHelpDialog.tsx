import React from 'react';
import { Modal } from 'react-bootstrap';

interface WaiverHelpDialogProps {
  show: boolean;
  onClose: () => void;
}

const WaiverHelpDialog: React.FC<WaiverHelpDialogProps> = ({ show, onClose }) => {
  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>FAAB Waiver System</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h5>How it works:</h5>
        <ul>
          <li>Each team starts with a FAAB (Free Agent Acquisition Budget) budget, set in the league settings.</li>
          <li>When waivers are enabled, players must be claimed through blind bids</li>
          <li>The highest bid wins the player</li>
          <li>The timing of the processing of bids is at the discretion of the commissioner, ask them for more details about when they plan to process bids</li>
          <li>The recommended bid timing is any time during the Friday before a Tactician's Trials</li>
          <li>If bids are tied, the team with the lower total score gets priority</li>
          <li>FAAB is deducted from your budget only if your bid wins</li>
          <li>Unsuccessful bids are returned to your budget</li>
          <li><strong>If you make a bid but no longer have the budget or roster space, your bid automatically fails</strong></li>
          <li>FAAB does not replenish - use it wisely!</li>
          <li>To Commissioners: The button to process waivers is in the League Settings tab</li>
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </Modal.Footer>
    </Modal>
  );
};

export default WaiverHelpDialog; 