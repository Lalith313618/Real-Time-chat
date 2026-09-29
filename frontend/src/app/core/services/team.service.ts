import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Team,
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMemberDto,
  TeamRole,
} from '../models/team.model';
import { resolveMediaUrl } from '../utils/media-url.util';

@Injectable({
  providedIn: 'root',
})
export class TeamService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/teams`;

  readonly teams = signal<Team[]>([]);
  readonly activeTeam = signal<Team | null>(null);
  readonly isLoading = signal<boolean>(false);

  readonly myRole = computed<TeamRole | null>(() => {
    return this.activeTeam()?.myRole || null;
  });

  readonly isLead = computed<boolean>(() => this.myRole() === 'LEAD');
  readonly isLeadOrAdmin = computed<boolean>(() => {
    const role = this.myRole();
    return role === 'LEAD' || role === 'ADMIN';
  });

  private normalizeTeam(team: Team): Team {
    if (!team) return team;
    return {
      ...team,
      icon: team.icon ? resolveMediaUrl(team.icon) : '',
      members: (team.members || []).map((m) => {
        if (m.user && typeof m.user === 'object') {
          return {
            ...m,
            user: {
              ...m.user,
              profileImage: m.user.profileImage ? resolveMediaUrl(m.user.profileImage) : '',
            },
          };
        }
        return m;
      }),
    };
  }

  loadTeams(orgId?: string): Observable<Team[]> {
    this.isLoading.set(true);
    const params: Record<string, string> = {};
    if (orgId) params['orgId'] = orgId;

    return this.http
      .get<{ status: string; results: number; teams: Team[] }>(this.apiUrl, { params })
      .pipe(
        map((res) => (res.teams || []).map((t) => this.normalizeTeam(t))),
        tap((teams) => {
          this.teams.set(teams);
          this.isLoading.set(false);
        })
      );
  }

  getTeamById(id: string): Observable<Team> {
    this.isLoading.set(true);
    return this.http
      .get<{ status: string; team: Team }>(`${this.apiUrl}/${id}`)
      .pipe(
        map((res) => this.normalizeTeam(res.team)),
        tap((team) => {
          this.activeTeam.set(team);
          this.isLoading.set(false);
        })
      );
  }

  createTeam(dto: CreateTeamDto): Observable<Team> {
    this.isLoading.set(true);
    return this.http
      .post<{ status: string; team: Team }>(this.apiUrl, dto)
      .pipe(
        map((res) => this.normalizeTeam(res.team)),
        tap((newTeam) => {
          this.teams.update((list) => [newTeam, ...list]);
          this.activeTeam.set(newTeam);
          this.isLoading.set(false);
        })
      );
  }

  updateTeam(id: string, dto: UpdateTeamDto): Observable<Team> {
    return this.http
      .put<{ status: string; team: Team }>(`${this.apiUrl}/${id}`, dto)
      .pipe(
        map((res) => this.normalizeTeam(res.team)),
        tap((updatedTeam) => {
          this.teams.update((list) =>
            list.map((t) => (t._id === id ? updatedTeam : t))
          );
          if (this.activeTeam()?._id === id) {
            this.activeTeam.set(updatedTeam);
          }
        })
      );
  }

  deleteTeam(id: string): Observable<{ status: string; message: string }> {
    return this.http
      .delete<{ status: string; message: string }>(`${this.apiUrl}/${id}`)
      .pipe(
        tap(() => {
          this.teams.update((list) => list.filter((t) => t._id !== id));
          if (this.activeTeam()?._id === id) {
            this.activeTeam.set(null);
          }
        })
      );
  }

  joinTeam(teamId: string): Observable<Team> {
    return this.http
      .post<{ status: string; team: Team }>(`${this.apiUrl}/${teamId}/members`, {})
      .pipe(
        map((res) => this.normalizeTeam(res.team)),
        tap((updatedTeam) => {
          this.teams.update((list) =>
            list.map((t) => (t._id === teamId ? updatedTeam : t))
          );
          if (this.activeTeam()?._id === teamId) {
            this.activeTeam.set(updatedTeam);
          }
        })
      );
  }

  addMember(teamId: string, dto: AddTeamMemberDto): Observable<Team> {
    return this.http
      .post<{ status: string; team: Team }>(`${this.apiUrl}/${teamId}/members`, dto)
      .pipe(
        map((res) => this.normalizeTeam(res.team)),
        tap((updatedTeam) => {
          this.teams.update((list) =>
            list.map((t) => (t._id === teamId ? updatedTeam : t))
          );
          if (this.activeTeam()?._id === teamId) {
            this.activeTeam.set(updatedTeam);
          }
        })
      );
  }

  changeMemberRole(
    teamId: string,
    memberId: string,
    role: TeamRole
  ): Observable<Team> {
    return this.http
      .put<{ status: string; team: Team }>(
        `${this.apiUrl}/${teamId}/members/${memberId}/role`,
        { role }
      )
      .pipe(
        map((res) => this.normalizeTeam(res.team)),
        tap((updatedTeam) => {
          this.teams.update((list) =>
            list.map((t) => (t._id === teamId ? updatedTeam : t))
          );
          if (this.activeTeam()?._id === teamId) {
            this.activeTeam.set(updatedTeam);
          }
        })
      );
  }

  removeMember(teamId: string, memberId: string): Observable<Team> {
    return this.http
      .delete<{ status: string; team: Team }>(
        `${this.apiUrl}/${teamId}/members/${memberId}`
      )
      .pipe(
        map((res) => this.normalizeTeam(res.team)),
        tap((updatedTeam) => {
          this.teams.update((list) =>
            list.map((t) => (t._id === teamId ? updatedTeam : t))
          );
          if (this.activeTeam()?._id === teamId) {
            this.activeTeam.set(updatedTeam);
          }
        })
      );
  }
}
