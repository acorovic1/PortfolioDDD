import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { PortfolioPiece } from '../types/PortfolioPiece';



export function usePortfolio() {
  const { token } = useAuth();
  const [artworks, setPortfolio] = useState<PortfolioPiece[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchPortfolio();
    }
  }, [token]);

  const fetchPortfolio = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/portfolio', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPortfolio(data);
      }
    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addArtwork = async (artwork:PortfolioPiece) => {
    try {
      const response = await fetch('http://localhost:3001/api/portfolio/addArtwork', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({  artwork:artwork })
      });

      if (response.ok) {
        const newArtwork = await response.json();
        setPortfolio(prev => [...prev, newArtwork]);

        console.log("HELLO BOYS!!! Added artwork with id ", newArtwork.id);
        return newArtwork;
      }
    } catch (error) {
      console.error('Failed to add artwork:', error);
    }
  };

  const updateArtwork = async (artwork:PortfolioPiece) => {
    try {
      const response = await fetch(`http://localhost:3001/api/portfolio/artworks/${artwork.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ infoData:artwork.infoData })
      });

      if (response.ok) {
        const updatedArtwork = await response.json();
        setPortfolio(prev => prev.map(a => a.id === artwork.id ? updatedArtwork : a));
        return updatedArtwork;
      }
    } catch (error) {
      console.error('Failed to update artwork:', error);
    }
  };

  const addRender = async (artworkId: string, url: string, caption: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/portfolio/artworks/${artworkId}/renders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, caption })
      });

      if (response.ok) {
        const newRender = await response.json();
        setPortfolio(prev => prev.map(a => 
          a.id === artworkId 
            ? { ...a, renders: [...a.renders, newRender] }
            : a
        ));
        return newRender;
      }
    } catch (error) {
      console.error('Failed to add render:', error);
    }
  };

  const deleteRender = async (artworkId: string, renderId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/portfolio/artworks/${artworkId}/renders/${renderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setPortfolio(prev => prev.map(a => 
          a.id === artworkId 
            ? { ...a, renders: a.renders.filter(r => r.id !== renderId) }
            : a
        ));
      }
    } catch (error) {
      console.error('Failed to delete render:', error);
    }
  };

  return {
    artworks,
    isLoading,
    addArtwork,
    updateArtwork,
    addRender,
    deleteRender,
    refreshPortfolio: fetchPortfolio
  };
}