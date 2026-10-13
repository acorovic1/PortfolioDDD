import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useAuth } from '@/frontend/hooks/useAuth';
import { useI18n } from '@/frontend/hooks/useI18n';
import { apiFetch, queryString } from '@/frontend/utils/api';
import type { FeedArtwork } from '@/types/Feed';
import type { MessageKey } from '@/frontend/i18n/en';
import LoginBackdrop from '@/frontend/components/LoginBackdrop';
import ArtworkCard from '@/frontend/components/explore/ArtworkCard';
import { CubeIcon, SunIcon, BriefcaseIcon } from '@/frontend/svg/Icons';
import { useHeroTransition, type HeroTransition } from './useHeroTransition';
import '@/frontend/css/Explore.css';
import '@/frontend/css/Landing.css';

const TRENDING_COUNT = 8;

const FEATURES: { icon: typeof CubeIcon; title: MessageKey; text: MessageKey }[] = [
  { icon: CubeIcon, title: 'landing.feature1Title', text: 'landing.feature1Text' },
  { icon: SunIcon, title: 'landing.feature2Title', text: 'landing.feature2Text' },
  { icon: BriefcaseIcon, title: 'landing.feature3Title', text: 'landing.feature3Text' },
];

const STEPS: { title: MessageKey; text: MessageKey }[] = [
  { title: 'landing.step1Title', text: 'landing.step1Text' },
  { title: 'landing.step2Title', text: 'landing.step2Text' },
  { title: 'landing.step3Title', text: 'landing.step3Text' },
];

type LandingPageProps = {
  // Called once the hero has grown into the login page's backdrop.
  onEnterAuth: (signup: boolean) => void;
  // Lets the toolbar's Login button play the same transition.
  transitionRef?: Ref<HeroTransition>;
  onExplore: () => void;
  onGoToPortfolio: () => void;
  onOpenArtwork: (username: string, artworkId: string) => void;
  onOpenUser: (username: string) => void;
  onJobs: () => void;
  onMarketplace: () => void;
};

// The home page: what the site is for, a live 3D carousel, a taste of
// trending work and the way in (sign up, or your portfolio when signed in).
export default function LandingPage({
  onEnterAuth, transitionRef, onExplore, onGoToPortfolio, onOpenArtwork, onOpenUser, onJobs, onMarketplace,
}: LandingPageProps) {
  const { user, token } = useAuth();
  const { t } = useI18n();
  const [trending, setTrending] = useState<FeedArtwork[]>([]);

  const pageRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { transition, leaving, returning, onBackdropAdopted } = useHeroTransition({ pageRef, placeholderRef, stageRef, onEntered: onEnterAuth });
  useImperativeHandle(transitionRef, () => transition);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ artworks: FeedArtwork[] }>(
      `/api/feed${queryString({ tab: 'trending', limit: TRENDING_COUNT, offset: 0 })}`,
      { token, signal: controller.signal }
    )
      .then(data => setTrending(data.artworks))
      // The section is simply left out if the feed can't be loaded.
      .catch(() => {});
    return () => controller.abort();
  }, [token]);

  const primaryAction = user ? onGoToPortfolio : () => transition.enter(true);
  const primaryLabel = user ? t('landing.goToPortfolio') : t('landing.createPortfolio');

  return (
    <div
      ref={pageRef}
      className={`landing-page${leaving ? ' landing-leaving' : ''}${returning ? ' landing-returning' : ''}`}
    >
      <section className="landing-hero">
        <div className="landing-hero-text">
          <h1>
            {t('landing.heroTitle')}{' '}
            <span className="landing-hero-accent">{t('landing.heroTitleAccent')}</span>
          </h1>
          <p>{t('landing.heroText')}</p>
          <div className="landing-actions">
            <button className="landing-btn primary" onClick={primaryAction}>{primaryLabel}</button>
            <button className="landing-btn" onClick={onExplore}>{t('landing.exploreWork')} →</button>
          </div>
        </div>
        <div ref={placeholderRef} className="landing-hero-visual">
          <div ref={stageRef} className="landing-hero-stage">
            <LoginBackdrop className="landing-hero-canvas" owner="landing" onAdopt={onBackdropAdopted} />
            <span className="landing-hero-hint">{t('landing.dragHint')}</span>
          </div>
        </div>
      </section>

      {trending.length > 0 && (
        <section className="landing-section">
          <div className="landing-section-header">
            <h2>{t('landing.trendingTitle')}</h2>
            <button className="landing-link" onClick={onExplore}>{t('landing.seeAll')} →</button>
          </div>
          <div className="explore-grid">
            {trending.map(artwork => (
              <ArtworkCard
                key={artwork.id}
                artwork={artwork}
                showMature={!!user?.showMature}
                onOpen={() => onOpenArtwork(artwork.username, artwork.id)}
                onOpenAuthor={() => onOpenUser(artwork.username)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="landing-section">
        <div className="landing-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="landing-feature">
              <span className="landing-feature-icon"><Icon /></span>
              <h3>{t(title)}</h3>
              <p>{t(text)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <h2>{t('landing.howTitle')}</h2>
        <ol className="landing-steps">
          {STEPS.map(({ title, text }, i) => (
            <li key={title} className="landing-step">
              <span className="landing-step-number">{i + 1}</span>
              <div>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-cta">
        <h2>{user ? t('landing.ctaTitleSignedIn') : t('landing.ctaTitle')}</h2>
        <button className="landing-btn primary" onClick={primaryAction}>{primaryLabel}</button>
      </section>

      <footer className="landing-footer">
        <nav aria-label={t('landing.footerNav')}>
          <button className="landing-link" onClick={onExplore}>{t('nav.explore')}</button>
          <button className="landing-link" onClick={onJobs}>{t('nav.jobs')}</button>
          <button className="landing-link" onClick={onMarketplace}>{t('nav.marketplace')}</button>
          {!user && <button className="landing-link" onClick={() => transition.enter(false)}>{t('nav.login')}</button>}
        </nav>
      </footer>
    </div>
  );
}
