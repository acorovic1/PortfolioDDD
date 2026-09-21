import '@/frontend/css/ArtworkInfo.css';

import type { ArtworkInfoData } from '@/types/ArtworkInfoData';
import type { Comment } from '@/types/Comment';
import { LaptopIcon, CalendarIcon, ActivityIcon } from '@/frontend/svg/Icons';
import CommentSection from '@/frontend/components/CommentSection';



export default function ArtworkInfo({
  info,
  editable,
  onUpdate,
  comments,
  onAddComment,
  onDeleteComment
}: {
  info: ArtworkInfoData,
  editable: boolean
  onUpdate: <K extends keyof ArtworkInfoData>(key: K, value: ArtworkInfoData[K]) => void;
  comments: Comment[];
  onAddComment: (text: string) => void;
  onDeleteComment?: (commentId: string) => void;
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
          <LaptopIcon className="info-icon" />
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
          <CalendarIcon className="info-icon" />
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
          <ActivityIcon className="info-icon" />
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

      <CommentSection comments={comments} onAddComment={onAddComment} onDeleteComment={onDeleteComment} />
    </div>
  );
}
