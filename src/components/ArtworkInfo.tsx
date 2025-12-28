import '../css/ArtworkInfo.css';

import type { ArtworkInfoData } from '../types/ArtworkInfoData';



type ArtworkInfoProps = {
  info: ArtworkInfoData;
  editable: boolean;

};

export default function ArtworkInfo({
  info,
  editable,
  onUpdate
}: {
  info: ArtworkInfoData,
  editable: boolean
  onUpdate: <K extends keyof ArtworkInfoData>(key: K, value: ArtworkInfoData[K]) => void;
}) {


  return (
    <div className="artwork-info">
      <div className="info-section">
        <h3 className="info-section-title">Description</h3>
        {editable ? (
          <textarea
            className="info-description-input"
            value={info.description}
            onChange={(e) => onUpdate('description', e.target.value)}
            placeholder="Enter description..."
          />
        ) : (
          <p className="info-description">{info.description}</p>
        )}
      </div>

      <div className="info-grid">
        <div className="info-card">
          <svg className="info-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <div className="info-content">
            <span className="info-label">Tools Used</span>
            {editable ? (
              <input
                type="text"
                value={info.tools.join(', ')}
                onChange={(e) => onUpdate('tools', e.target.value.split(',').map(t => t.trim()))}
                placeholder="Enter tools separated by commas"
              />
            ) : (
              <div className="info-tools">
                {info.tools.map((tool, i) => (
                  <span key={i} className="tool-tag">{tool}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="info-card">
          <svg className="info-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div className="info-content">
            <span className="info-label">Year</span>
            {editable ? (
              <input
                type="text"
                value={info.year}
                onChange={(e) => onUpdate('year', e.target.value)}
              />
            ) : (
              <span className="info-value">{info.year}</span>
            )}
          </div>
        </div>

        <div className="info-card">
          <svg className="info-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <div className="info-content">
            <span className="info-label">Category</span>
            {editable ? (
              <input
                type="text"
                value={info.category}
                onChange={(e) => onUpdate('category', e.target.value)}
              />
            ) : (
              <span className="info-value">{info.category}</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
