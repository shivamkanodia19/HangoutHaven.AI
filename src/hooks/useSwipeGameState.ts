import { useReducer, useCallback } from 'react';
import { Place } from '@/types/place';

// Match interface for unanimous matches
export interface Match {
  id: string;
  place_id: string;
  place_data: Place;
  is_final_choice: boolean;
  like_count: number;
}

// Game state interface
export interface GameState {
  // Round tracking
  round: number;
  currentIndex: number;
  deck: Place[];
  
  // Participants
  participantCount: number;
  participantUserIds: string[];
  currentUserId: string | null;
  isHost: boolean;
  
  // Matches and candidates
  allMatches: Match[]; // All unanimous matches across all rounds
  roundMatches: Match[]; // Matches from current round only
  advancingCandidates: Place[]; // Places advancing to next round
  
  // Like tracking per place (for current round)
  swipeCounts: Record<string, number>; // place_id -> like count
  
  // Game flow state
  isLoading: boolean;
  isVoteMode: boolean;
  gameEnded: boolean;
  showRoundSummary: boolean;
  nextAction: 'nextRound' | 'vote' | 'end' | null;
  
  // Final winner
  finalWinner: Place | null;
}

// Action types
type GameAction =
  | { type: 'SET_PARTICIPANTS'; payload: { count: number; userIds: string[]; currentUserId: string | null; isHost: boolean } }
  | { type: 'SET_DECK'; payload: Place[] }
  | { type: 'SET_ROUND'; payload: number }
  | { type: 'INCREMENT_INDEX' }
  | { type: 'SET_INDEX'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SWIPE_COUNTS'; payload: Record<string, number> }
  | { type: 'SET_ROUND_MATCHES'; payload: Match[] }
  | { type: 'ADD_TO_ALL_MATCHES'; payload: Match[] }
  | { type: 'SET_ADVANCING_CANDIDATES'; payload: Place[] }
  | { type: 'SET_SHOW_ROUND_SUMMARY'; payload: boolean }
  | { type: 'SET_NEXT_ACTION'; payload: 'nextRound' | 'vote' | 'end' | null }
  | { type: 'START_VOTE_MODE' }
  | { type: 'END_GAME'; payload: Place | null }
  | { type: 'RESET_ROUND_STATE' }
  | { type: 'ADVANCE_TO_NEXT_ROUND'; payload: { newDeck: Place[]; newRound: number } };

// Initial state
const initialState: GameState = {
  round: 1,
  currentIndex: 0,
  deck: [],
  participantCount: 0,
  participantUserIds: [],
  currentUserId: null,
  isHost: false,
  allMatches: [],
  roundMatches: [],
  advancingCandidates: [],
  swipeCounts: {},
  isLoading: false,
  isVoteMode: false,
  gameEnded: false,
  showRoundSummary: false,
  nextAction: null,
  finalWinner: null,
};

// Reducer function
function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_PARTICIPANTS':
      return {
        ...state,
        participantCount: action.payload.count,
        participantUserIds: action.payload.userIds,
        currentUserId: action.payload.currentUserId,
        isHost: action.payload.isHost,
      };
      
    case 'SET_DECK':
      return {
        ...state,
        deck: action.payload,
        currentIndex: 0, // Reset index when deck changes
      };
      
    case 'SET_ROUND':
      return {
        ...state,
        round: action.payload,
      };
      
    case 'INCREMENT_INDEX':
      return {
        ...state,
        currentIndex: Math.min(state.currentIndex + 1, state.deck.length),
      };
      
    case 'SET_INDEX':
      return {
        ...state,
        currentIndex: action.payload,
      };
      
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
      
    case 'SET_SWIPE_COUNTS':
      return {
        ...state,
        swipeCounts: action.payload,
      };
      
    case 'SET_ROUND_MATCHES':
      return {
        ...state,
        roundMatches: action.payload,
      };
      
    case 'ADD_TO_ALL_MATCHES':
      return {
        ...state,
        allMatches: [...state.allMatches, ...action.payload],
      };
      
    case 'SET_ADVANCING_CANDIDATES':
      return {
        ...state,
        advancingCandidates: action.payload,
      };
      
    case 'SET_SHOW_ROUND_SUMMARY':
      return {
        ...state,
        showRoundSummary: action.payload,
      };
      
    case 'SET_NEXT_ACTION':
      return {
        ...state,
        nextAction: action.payload,
      };
      
    case 'START_VOTE_MODE':
      return {
        ...state,
        isVoteMode: true,
        showRoundSummary: false,
        roundMatches: [],
        swipeCounts: {},
        nextAction: null,
      };
      
    case 'END_GAME':
      return {
        ...state,
        gameEnded: true,
        showRoundSummary: false,
        nextAction: null,
        finalWinner: action.payload,
      };
      
    case 'RESET_ROUND_STATE':
      return {
        ...state,
        currentIndex: 0,
        roundMatches: [],
        advancingCandidates: [],
        swipeCounts: {},
        showRoundSummary: false,
        nextAction: null,
      };
      
    case 'ADVANCE_TO_NEXT_ROUND':
      return {
        ...state,
        round: action.payload.newRound,
        deck: action.payload.newDeck,
        currentIndex: 0,
        roundMatches: [],
        advancingCandidates: [],
        swipeCounts: {},
        showRoundSummary: false,
        nextAction: null,
        isVoteMode: false,
      };
      
    default:
      return state;
  }
}

// Custom hook for game state management
export function useSwipeGameState(initialDeck: Place[]) {
  const [state, dispatch] = useReducer(gameReducer, {
    ...initialState,
    deck: initialDeck,
  });

  // Action creators
  const actions = {
    setParticipants: useCallback((count: number, userIds: string[], currentUserId: string | null, isHost: boolean) => {
      dispatch({ type: 'SET_PARTICIPANTS', payload: { count, userIds, currentUserId, isHost } });
    }, []),
    
    setDeck: useCallback((deck: Place[]) => {
      dispatch({ type: 'SET_DECK', payload: deck });
    }, []),
    
    setRound: useCallback((round: number) => {
      dispatch({ type: 'SET_ROUND', payload: round });
    }, []),
    
    incrementIndex: useCallback(() => {
      dispatch({ type: 'INCREMENT_INDEX' });
    }, []),
    
    setIndex: useCallback((index: number) => {
      dispatch({ type: 'SET_INDEX', payload: index });
    }, []),
    
    setLoading: useCallback((loading: boolean) => {
      dispatch({ type: 'SET_LOADING', payload: loading });
    }, []),
    
    setSwipeCounts: useCallback((counts: Record<string, number>) => {
      dispatch({ type: 'SET_SWIPE_COUNTS', payload: counts });
    }, []),
    
    setRoundMatches: useCallback((matches: Match[]) => {
      dispatch({ type: 'SET_ROUND_MATCHES', payload: matches });
    }, []),
    
    addToAllMatches: useCallback((matches: Match[]) => {
      dispatch({ type: 'ADD_TO_ALL_MATCHES', payload: matches });
    }, []),
    
    setAdvancingCandidates: useCallback((candidates: Place[]) => {
      dispatch({ type: 'SET_ADVANCING_CANDIDATES', payload: candidates });
    }, []),
    
    setShowRoundSummary: useCallback((show: boolean) => {
      dispatch({ type: 'SET_SHOW_ROUND_SUMMARY', payload: show });
    }, []),
    
    setNextAction: useCallback((action: 'nextRound' | 'vote' | 'end' | null) => {
      dispatch({ type: 'SET_NEXT_ACTION', payload: action });
    }, []),
    
    startVoteMode: useCallback(() => {
      dispatch({ type: 'START_VOTE_MODE' });
    }, []),
    
    endGame: useCallback((winner: Place | null) => {
      dispatch({ type: 'END_GAME', payload: winner });
    }, []),
    
    resetRoundState: useCallback(() => {
      dispatch({ type: 'RESET_ROUND_STATE' });
    }, []),
    
    advanceToNextRound: useCallback((newDeck: Place[], newRound: number) => {
      dispatch({ type: 'ADVANCE_TO_NEXT_ROUND', payload: { newDeck, newRound } });
    }, []),
  };

  return { state, actions };
}

