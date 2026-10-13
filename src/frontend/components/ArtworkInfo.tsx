import '@/frontend/css/ArtworkInfo.css';

import type { ArtworkInfoData } from '@/types/ArtworkInfoData';
import type { Comment } from '@/types/Comment';
import { LaptopIcon, CalendarIcon, ActivityIcon } from '@/frontend/svg/Icons';
import CommentSection from '@/frontend/components/CommentSection';
import { useNavigate } from 'react-router-dom';

const splitList = (value: string) => value.split(',').map(t => t.trim());



export default function ArtworkInfo({
  info,
  editable,
  onUpdate,
  comments,
  onAddComment,
  onDeleteComment,
  onReportComment,
}: {
  info: ArtworkInfoData,
  editable: boolean
  onUpdate: <K extends keyof ArtworkInfoData>(key: K, value: ArtworkInfoData[K]) => void;
  comments: Comment[];
  onAddComment: (text: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onReportComment?: (comment: Comment) => void;
}) {
  const navigate = useNavigate();
  const explore = (key: 'tag' | 'tool', value: string) => navigate(`/explore?${key}=${encodeURIComponent(value)}`);

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
                onChange={(e) => onUpdate('tools', splitList(e.target.value))}
                placeholder="Enter tools separated by commas"
              />
            ) : (
              <div className="info-tools">
                {info.tools.filter(Boolean).map((tool, i) => (
                  <button key={i} className="tool-tag" onClick={() => explore('tool', tool)} title={`More made with ${tool}`}>
                    {tool}
                  </button>
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

      {(editable || info.tags.length > 0) && (
        <div className="info-section info-tags-section">
          <h3 className="info-section-title">Tags</h3>
          {editable ? (
            <input
              className="info-tags-input"
              type="text"
              value={info.tags.join(', ')}
              onChange={(e) => onUpdate('tags', splitList(e.target.value))}
              placeholder="e.g. hard-surface, sci-fi, game-ready"
            />
          ) : (
            <div className="info-tags">
              {info.tags.map(tag => (
                <button key={tag} className="info-tag" onClick={() => explore('tag', tag)}>#{tag}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <CommentSection
        comments={comments}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        onReportComment={onReportComment}
      />
    </div>
  );
}
