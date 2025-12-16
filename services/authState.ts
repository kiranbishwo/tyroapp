/**
 * Authentication State Management Service
 * Manages user authentication state, user data, and workspace selection
 */

import { AuthenticatedUser, Workspace } from '../types';
import { BASE_URL } from '../config/domainConfig';

export interface AuthState {
    isAuthenticated: boolean;
    user: AuthenticatedUser | null;
    workspaces: Workspace[];
    currentWorkspace: Workspace | null;
    token: string | null;
    expiresAt: number | null;
    fullResponse: any | null; // Full poll API response
}

class AuthStateManager {
    private state: AuthState = {
        isAuthenticated: false,
        user: null,
        workspaces: [],
        currentWorkspace: null,
        token: null,
        expiresAt: null,
        fullResponse: null,
    };

    private listeners: Set<(state: AuthState) => void> = new Set();

    /**
     * Initialize auth state from stored data
     */
    async initialize(): Promise<void> {
        if (typeof window === 'undefined' || !window.electronAPI) {
            return;
        }

        try {
            const status = await window.electronAPI.oauthCheckStatus();
            if (status.authenticated && status.user) {
                // Get full auth data including workspaces
                const authData = await this.getFullAuthData();
                if (authData) {
                    this.setState(authData);
                }
            }
        } catch (error) {
            console.error('Failed to initialize auth state:', error);
        }
    }

    /**
     * Get full authentication data including workspaces
     */
    private async getFullAuthData(): Promise<AuthState | null> {
        if (typeof window === 'undefined' || !window.electronAPI) {
            return null;
        }

        try {
            const status = await window.electronAPI.oauthCheckStatus();
            if (!status.authenticated || !status.user) {
                console.log('[AUTH STATE] Not authenticated or no user');
                return null;
            }

            const workspaces = (status.workspaces || []) as Workspace[];
            const currentWorkspace = (status.currentWorkspace || null) as Workspace | null;
            
            console.log('[AUTH STATE] Loaded auth data:', {
                user: status.user?.name,
                workspacesCount: workspaces.length,
                currentWorkspace: currentWorkspace?.workspace_name || 'None',
            });

            return {
                isAuthenticated: true,
                user: status.user as AuthenticatedUser,
                workspaces,
                currentWorkspace,
                token: null, // Token is retrieved via IPC when needed
                expiresAt: status.expires_at || null,
                fullResponse: null, // Will be set when full auth data is available
            };
        } catch (error) {
            console.error('Failed to get full auth data:', error);
            return null;
        }
    }

    /**
     * Set authentication state
     */
    setAuthData(
        user: AuthenticatedUser,
        workspaces: Workspace[],
        token: string,
        expiresAt: number,
        currentWorkspaceId?: number,
        fullResponse?: any
    ): void {
        console.log('[AUTH STATE] Setting auth data:', {
            userName: user.name,
            workspacesCount: workspaces.length,
            currentWorkspaceId,
        });
        
        // Select workspace: prefer the one specified, or general workspace, or first one
        let selectedWorkspace: Workspace | null = null;
        
        if (currentWorkspaceId) {
            selectedWorkspace = workspaces.find(w => w.workspace_id === currentWorkspaceId) || null;
            if (selectedWorkspace) {
                console.log('[AUTH STATE] Selected workspace by ID:', selectedWorkspace.workspace_name);
            }
        }
        
        if (!selectedWorkspace) {
            selectedWorkspace = workspaces.find(w => w.workspace_is_general) || null;
            if (selectedWorkspace) {
                console.log('[AUTH STATE] Selected general workspace:', selectedWorkspace.workspace_name);
            }
        }
        
        if (!selectedWorkspace && workspaces.length > 0) {
            selectedWorkspace = workspaces[0];
            console.log('[AUTH STATE] Selected first workspace:', selectedWorkspace.workspace_name);
        }

        if (!selectedWorkspace && workspaces.length === 0) {
            console.warn('[AUTH STATE] ⚠️ No workspaces available!');
        }

        this.setState({
            isAuthenticated: true,
            user,
            workspaces,
            currentWorkspace: selectedWorkspace,
            token,
            expiresAt,
            fullResponse: fullResponse || null,
        });
    }

    /**
     * Set current workspace
     */
    async setCurrentWorkspace(workspaceId: string | number): Promise<boolean> {
        const workspace = this.state.workspaces.find(w => 
            String(w.workspace_id) === String(workspaceId)
        );
        if (!workspace) {
            console.warn(`Workspace ${workspaceId} not found`);
            return false;
        }

        // Persist workspace selection in main process
        if (typeof window !== 'undefined' && window.electronAPI) {
            try {
                const result = await window.electronAPI.oauthSetWorkspace(workspaceId);
                if (!result.success) {
                    console.error('Failed to set workspace:', result.error);
                    return false;
                }
            } catch (error) {
                console.error('Error setting workspace:', error);
                return false;
            }
        }

        this.setState({
            ...this.state,
            currentWorkspace: workspace,
        });

        return true;
    }

    /**
     * Clear authentication state (logout)
     */
    clearAuth(): void {
        this.setState({
            isAuthenticated: false,
            user: null,
            workspaces: [],
            currentWorkspace: null,
            token: null,
            expiresAt: null,
            fullResponse: null,
        });
    }

    /**
     * Get current state
     */
    getState(): AuthState {
        return { ...this.state };
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: (state: AuthState) => void): () => void {
        this.listeners.add(listener);
        // Immediately call with current state
        listener(this.getState());
        
        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Update state and notify listeners
     */
    private setState(newState: AuthState): void {
        this.state = newState;
        this.notifyListeners();
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(): void {
        const state = this.getState();
        this.listeners.forEach(listener => {
            try {
                listener(state);
            } catch (error) {
                console.error('Error in auth state listener:', error);
            }
        });
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return this.state.isAuthenticated && this.state.user !== null;
    }

    /**
     * Get current user
     */
    getUser(): AuthenticatedUser | null {
        return this.state.user;
    }

    /**
     * Get current workspace
     */
    getCurrentWorkspace(): Workspace | null {
        return this.state.currentWorkspace;
    }

    /**
     * Get all workspaces
     */
    getWorkspaces(): Workspace[] {
        return [...this.state.workspaces];
    }

    /**
     * Check if token is expired
     */
    isTokenExpired(): boolean {
        if (!this.state.expiresAt) {
            return false; // Can't determine, assume not expired
        }
        return Date.now() >= this.state.expiresAt;
    }

    /**
     * Get full response data
     */
    getFullResponse(): any | null {
        return this.state.fullResponse;
    }

    /**
     * Get workspace domain for API base URL
     */
    getWorkspaceDomain(): string | null {
        const workspace = this.state.currentWorkspace;
        if (!workspace || !workspace.domain) {
            return null;
        }
        return workspace.domain;
    }

    /**
     * Get API base URL based on workspace domain
     */
    getApiBaseUrl(): string {
        const domain = this.getWorkspaceDomain();
        if (domain) {
            // Remove protocol and port if present
            let cleanDomain = domain.replace(/^https?:\/\//, '').split(':')[0];
            // Get protocol and port from BASE_URL
            const protocol = BASE_URL.split('://')[0];
            const baseUrlParts = BASE_URL.replace(/^https?:\/\//, '').split(':');
            const port = baseUrlParts.length > 1 ? `:${baseUrlParts[1]}` : '';
            // Use the domain from workspace with port from BASE_URL
            return `${protocol}://${cleanDomain}${port}/api`;
        }
        // Fallback to centralized BASE_URL
        return `${BASE_URL}/api`;
    }
}

// Export singleton instance
export const authState = new AuthStateManager();
export default authState;

