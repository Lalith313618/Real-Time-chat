import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Organization,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  InviteMemberDto,
  OrganizationRole,
} from '../models/organization.model';
import { resolveMediaUrl } from '../utils/media-url.util';

@Injectable({
  providedIn: 'root',
})
export class OrganizationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/organizations`;

 
  readonly organizations = signal<Organization[]>([]);
  readonly currentOrganization = signal<Organization | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly myRole = computed<OrganizationRole | null>(() => {
    return this.currentOrganization()?.myRole || null;
  });

  readonly isOwner = computed<boolean>(() => this.myRole() === 'OWNER');
  readonly isAdmin = computed<boolean>(() => this.myRole() === 'ADMIN');
  readonly isManager = computed<boolean>(() => this.myRole() === 'MANAGER');

  readonly isOwnerOrAdmin = computed<boolean>(() => {
    const role = this.myRole();
    return role === 'OWNER' || role === 'ADMIN';
  });

  readonly canManageMembers = computed<boolean>(() => {
    const role = this.myRole();
    return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
  });

  constructor() {
    
    const savedOrgId = typeof window !== 'undefined' ? localStorage.getItem('chatnest_active_org_id') : null;
    if (savedOrgId) {
      this.loadUserOrganizations(savedOrgId).subscribe({
        error: () => {},
      });
    }
  }

  private normalizeOrg(org: Organization): Organization {
    if (!org) return org;
    return {
      ...org,
      logo: org.logo ? resolveMediaUrl(org.logo) : '',
      members: (org.members || []).map((m) => {
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

  loadUserOrganizations(preferredOrgId?: string): Observable<Organization[]> {
    this.isLoading.set(true);
    return this.http
      .get<{ status: string; results: number; organizations: Organization[] }>(this.apiUrl)
      .pipe(
        map((res) => (res.organizations || []).map((o) => this.normalizeOrg(o))),
        tap((orgs) => {
          this.organizations.set(orgs);
          this.isLoading.set(false);

          if (orgs.length === 0) {
            this.currentOrganization.set(null);
            if (typeof window !== 'undefined') {
              localStorage.removeItem('chatnest_active_org_id');
            }
            return;
          }
          const targetId =
            preferredOrgId ||
            (typeof window !== 'undefined' ? localStorage.getItem('chatnest_active_org_id') : null) ||
            this.currentOrganization()?._id;

          let selected = orgs.find((o) => o._id === targetId);
          if (!selected && orgs.length > 0) {
            selected = orgs[0];
          }

          if (selected) {
            this.setCurrentOrganization(selected);
          }
        })
      );
  }

  getOrganizationById(id: string): Observable<Organization> {
    this.isLoading.set(true);
    return this.http
      .get<{ status: string; organization: Organization }>(`${this.apiUrl}/${id}`)
      .pipe(
        map((res) => this.normalizeOrg(res.organization)),
        tap((org) => {
          this.setCurrentOrganization(org);
          this.isLoading.set(false);
        })
      );
  }

  setCurrentOrganization(org: Organization): void {
    const normalized = this.normalizeOrg(org);
    this.currentOrganization.set(normalized);
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatnest_active_org_id', normalized._id);
    }
  }

  createOrganization(dto: CreateOrganizationDto): Observable<Organization> {
    this.isLoading.set(true);
    return this.http
      .post<{ status: string; organization: Organization }>(this.apiUrl, dto)
      .pipe(
        map((res) => this.normalizeOrg(res.organization)),
        tap((newOrg) => {
          this.organizations.update((list) => [newOrg, ...list]);
          this.setCurrentOrganization(newOrg);
          this.isLoading.set(false);
        })
      );
  }

  updateOrganization(id: string, dto: UpdateOrganizationDto): Observable<Organization> {
    return this.http
      .put<{ status: string; organization: Organization }>(`${this.apiUrl}/${id}`, dto)
      .pipe(
        map((res) => this.normalizeOrg(res.organization)),
        tap((updatedOrg) => {
          this.organizations.update((list) =>
            list.map((o) => (o._id === id ? updatedOrg : o))
          );
          if (this.currentOrganization()?._id === id) {
            this.setCurrentOrganization(updatedOrg);
          }
        })
      );
  }

  switchOrganization(id: string): Observable<Organization> {
    this.isLoading.set(true);
    return this.http
      .put<{ status: string; organization: Organization }>(`${this.apiUrl}/${id}/switch`, {})
      .pipe(
        map((res) => this.normalizeOrg(res.organization)),
        tap((org) => {
          this.setCurrentOrganization(org);
          this.isLoading.set(false);
        })
      );
  }

  inviteMember(orgId: string, dto: InviteMemberDto): Observable<Organization> {
    return this.http
      .post<{ status: string; organization: Organization }>(
        `${this.apiUrl}/${orgId}/members`,
        dto
      )
      .pipe(
        map((res) => this.normalizeOrg(res.organization)),
        tap((updatedOrg) => {
          this.organizations.update((list) =>
            list.map((o) => (o._id === orgId ? updatedOrg : o))
          );
          if (this.currentOrganization()?._id === orgId) {
            this.setCurrentOrganization(updatedOrg);
          }
        })
      );
  }

  changeMemberRole(
    orgId: string,
    memberId: string,
    role: OrganizationRole
  ): Observable<Organization> {
    return this.http
      .put<{ status: string; organization: Organization }>(
        `${this.apiUrl}/${orgId}/members/${memberId}/role`,
        { role }
      )
      .pipe(
        map((res) => this.normalizeOrg(res.organization)),
        tap((updatedOrg) => {
          this.organizations.update((list) =>
            list.map((o) => (o._id === orgId ? updatedOrg : o))
          );
          if (this.currentOrganization()?._id === orgId) {
            this.setCurrentOrganization(updatedOrg);
          }
        })
      );
  }

  removeMember(orgId: string, memberId: string): Observable<Organization> {
    return this.http
      .delete<{ status: string; organization: Organization }>(
        `${this.apiUrl}/${orgId}/members/${memberId}`
      )
      .pipe(
        map((res) => this.normalizeOrg(res.organization)),
        tap((updatedOrg) => {
          if (!updatedOrg.myRole) {
            this.organizations.update((list) => list.filter((o) => o._id !== orgId));
            const remaining = this.organizations();
            if (remaining.length > 0) {
              this.setCurrentOrganization(remaining[0]);
            } else {
              this.currentOrganization.set(null);
              if (typeof window !== 'undefined') {
                localStorage.removeItem('chatnest_active_org_id');
              }
            }
          } else {
            this.organizations.update((list) =>
              list.map((o) => (o._id === orgId ? updatedOrg : o))
            );
            if (this.currentOrganization()?._id === orgId) {
              this.setCurrentOrganization(updatedOrg);
            }
          }
        })
      );
  }

  uploadLogo(orgId: string, file: File): Observable<{ logoUrl: string }> {
    const formData = new FormData();
    formData.append('logo', file);
    return this.http
      .post<{ status: string; logoUrl: string }>(`${this.apiUrl}/${orgId}/logo`, formData)
      .pipe(
        tap((res) => {
          const current = this.currentOrganization();
          if (current && current._id === orgId) {
            this.currentOrganization.set({
              ...current,
              logo: resolveMediaUrl(res.logoUrl),
            });
          }
        })
      );
  }
}
