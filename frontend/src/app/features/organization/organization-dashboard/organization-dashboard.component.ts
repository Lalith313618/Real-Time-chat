import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrganizationService } from '../../../core/services/organization.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { MediaUrlPipe } from '../../../core/pipes/media-url.pipe';
import {
  Organization,
  OrganizationMember,
  OrganizationRole,
} from '../../../core/models/organization.model';
import { User } from '../../../core/models/user.model';

@Component({
  selector: 'app-organization-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MediaUrlPipe],
  templateUrl: './organization-dashboard.component.html',
  styleUrl: './organization-dashboard.component.css',
})
export class OrganizationDashboardComponent implements OnInit {
  readonly orgService = inject(OrganizationService);
  readonly userService = inject(UserService);
  readonly authService = inject(AuthService);

  activeTab = signal<'members' | 'settings'>('members');

  
  memberSearchQuery = signal<string>('');
  roleFilter = signal<string>('ALL');

  isCreateModalOpen = signal<boolean>(false);
  isInviteModalOpen = signal<boolean>(false);

  
  newOrgName = signal<string>('');
  newOrgDesc = signal<string>('');
  isCreating = signal<boolean>(false);
  createError = signal<string>('');
  inviteQuery = signal<string>('');
  inviteRole = signal<OrganizationRole>('MEMBER');
  foundUsers = signal<User[]>([]);
  selectedUserToInvite = signal<User | null>(null);
  isSearchingUsers = signal<boolean>(false);
  isInviting = signal<boolean>(false);
  inviteError = signal<string>('');
  inviteSuccess = signal<string>('');
  settingsName = signal<string>('');
  settingsDesc = signal<string>('');
  isSavingSettings = signal<boolean>(false);
  settingsMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  logoUploading = signal<boolean>(false);


  actionFeedback = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  readonly allMembers = computed<OrganizationMember[]>(() => {
    return this.orgService.currentOrganization()?.members || [];
  });

  readonly filteredMembers = computed<OrganizationMember[]>(() => {
    const query = this.memberSearchQuery().toLowerCase().trim();
    const role = this.roleFilter();
    let members = this.allMembers();

    if (role !== 'ALL') {
      members = members.filter((m) => m.role === role);
    }

    if (query) {
      members = members.filter((m) => {
        const name = m.user?.name?.toLowerCase() || '';
        const email = m.user?.email?.toLowerCase() || '';
        return name.includes(query) || email.includes(query);
      });
    }

    return members;
  });

  readonly stats = computed(() => {
    const members = this.allMembers();
    return {
      total: members.length,
      owners: members.filter((m) => m.role === 'OWNER').length,
      admins: members.filter((m) => m.role === 'ADMIN').length,
      managers: members.filter((m) => m.role === 'MANAGER').length,
      members: members.filter((m) => m.role === 'MEMBER').length,
      guests: members.filter((m) => m.role === 'GUEST').length,
    };
  });

  readonly availableRoles: OrganizationRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'GUEST'];

  ngOnInit(): void {
    this.orgService.loadUserOrganizations().subscribe({
      next: (orgs) => {
        if (orgs.length > 0 && !this.orgService.currentOrganization()) {
          this.selectOrganization(orgs[0]._id);
        } else if (this.orgService.currentOrganization()) {
          this.initSettingsForm();
        }
      },
    });
  }

  selectOrganization(orgId: string): void {
    const org = this.orgService.organizations().find((o) => o._id === orgId);
    if (org) {
      this.orgService.switchOrganization(org._id).subscribe({
        next: () => {
          this.initSettingsForm();
          this.showFeedback('success', `Switched to workspace: ${org.name}`);
        },
        error: (err) => {
          this.showFeedback('error', err.error?.message || 'Failed to switch organization');
        },
      });
    }
  }

  initSettingsForm(): void {
    const current = this.orgService.currentOrganization();
    if (current) {
      this.settingsName.set(current.name);
      this.settingsDesc.set(current.description || '');
      this.settingsMessage.set(null);
    }
  }

  // Create Organization
  openCreateModal(): void {
    this.newOrgName.set('');
    this.newOrgDesc.set('');
    this.createError.set('');
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  submitCreateOrg(): void {
    const name = this.newOrgName().trim();
    if (!name || name.length < 2) {
      this.createError.set('Workspace name must be at least 2 characters');
      return;
    }

    this.isCreating.set(true);
    this.createError.set('');

    this.orgService
      .createOrganization({
        name,
        description: this.newOrgDesc().trim(),
      })
      .subscribe({
        next: (created) => {
          this.isCreating.set(false);
          this.closeCreateModal();
          this.initSettingsForm();
          this.showFeedback('success', `Workspace "${created.name}" created successfully!`);
        },
        error: (err) => {
          this.isCreating.set(false);
          this.createError.set(err.error?.message || 'Error creating organization');
        },
      });
  }

  // Invite Member
  openInviteModal(): void {
    this.inviteQuery.set('');
    this.inviteRole.set('MEMBER');
    this.selectedUserToInvite.set(null);
    this.foundUsers.set([]);
    this.inviteError.set('');
    this.inviteSuccess.set('');
    this.isInviteModalOpen.set(true);
  }

  closeInviteModal(): void {
    this.isInviteModalOpen.set(false);
  }

  onInviteQueryChange(query: string): void {
    this.inviteQuery.set(query);
    this.selectedUserToInvite.set(null);
    this.inviteError.set('');

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      this.foundUsers.set([]);
      return;
    }

    this.isSearchingUsers.set(true);
    this.userService.searchUsers(trimmed).subscribe({
      next: (users) => {
        // Filter out users who are already members
        const currentMemberIds = new Set(
          this.allMembers().map((m) => (typeof m.user === 'object' ? m.user._id : m.user))
        );
        const filtered = users.filter((u) => !currentMemberIds.has(u._id));
        this.foundUsers.set(filtered);
        this.isSearchingUsers.set(false);
      },
      error: () => {
        this.isSearchingUsers.set(false);
      },
    });
  }

  selectUserToInvite(user: User): void {
    this.selectedUserToInvite.set(user);
    this.inviteQuery.set(user.email);
    this.foundUsers.set([]);
  }

  submitInvite(): void {
    const org = this.orgService.currentOrganization();
    if (!org) return;

    const selected = this.selectedUserToInvite();
    const query = this.inviteQuery().trim();

    if (!selected && !query) {
      this.inviteError.set('Please select a user or enter an email address');
      return;
    }

    this.isInviting.set(true);
    this.inviteError.set('');
    this.inviteSuccess.set('');

    const payload = selected
      ? { userId: selected._id, role: this.inviteRole() }
      : { email: query, role: this.inviteRole() };

    this.orgService.inviteMember(org._id, payload).subscribe({
      next: (res) => {
        this.isInviting.set(false);
        this.inviteSuccess.set(`Member added successfully to ${org.name}`);
        this.inviteQuery.set('');
        this.selectedUserToInvite.set(null);
        setTimeout(() => this.closeInviteModal(), 1200);
      },
      error: (err) => {
        this.isInviting.set(false);
        this.inviteError.set(err.error?.message || 'Failed to add member');
      },
    });
  }

  // Change Role
  onRoleChange(member: OrganizationMember, newRole: OrganizationRole): void {
    const org = this.orgService.currentOrganization();
    if (!org || !member.user) return;

    const memberId = typeof member.user === 'object' ? member.user._id : member.user;
    if (member.role === newRole) return;

    this.orgService.changeMemberRole(org._id, memberId, newRole).subscribe({
      next: () => {
        this.showFeedback('success', `Updated ${member.user.name}'s role to ${newRole}`);
      },
      error: (err) => {
        this.showFeedback('error', err.error?.message || 'Failed to update member role');
        // Reload to revert UI
        this.orgService.getOrganizationById(org._id).subscribe();
      },
    });
  }

  // Remove Member
  confirmRemoveMember(member: OrganizationMember): void {
    const org = this.orgService.currentOrganization();
    if (!org || !member.user) return;

    const currentUserId = this.authService.currentUser()?._id;
    const memberId = typeof member.user === 'object' ? member.user._id : member.user;
    const isSelf = currentUserId === memberId;

    const promptText = isSelf
      ? `Are you sure you want to leave ${org.name}?`
      : `Are you sure you want to remove ${member.user.name} from this organization?`;

    if (confirm(promptText)) {
      this.orgService.removeMember(org._id, memberId).subscribe({
        next: () => {
          this.showFeedback(
            'success',
            isSelf ? 'You have left the organization' : 'Member removed successfully'
          );
        },
        error: (err) => {
          this.showFeedback('error', err.error?.message || 'Failed to remove member');
        },
      });
    }
  }
  saveSettings(): void {
    const org = this.orgService.currentOrganization();
    if (!org) return;

    const name = this.settingsName().trim();
    if (!name || name.length < 2) {
      this.settingsMessage.set({
        type: 'error',
        text: 'Organization name must be at least 2 characters',
      });
      return;
    }

    this.isSavingSettings.set(true);
    this.settingsMessage.set(null);

    this.orgService
      .updateOrganization(org._id, {
        name,
        description: this.settingsDesc().trim(),
      })
      .subscribe({
        next: () => {
          this.isSavingSettings.set(false);
          this.settingsMessage.set({
            type: 'success',
            text: 'Workspace settings saved successfully',
          });
        },
        error: (err) => {
          this.isSavingSettings.set(false);
          this.settingsMessage.set({
            type: 'error',
            text: err.error?.message || 'Failed to save settings',
          });
        },
      });
  }
  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const org = this.orgService.currentOrganization();
    if (!file || !org) return;

    this.logoUploading.set(true);
    this.orgService.uploadLogo(org._id, file).subscribe({
      next: () => {
        this.logoUploading.set(false);
        this.showFeedback('success', 'Workspace logo updated successfully');
      },
      error: (err) => {
        this.logoUploading.set(false);
        this.showFeedback('error', err.error?.message || 'Failed to upload logo');
      },
    });
  }

  copyInviteCode(code?: string): void {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.showFeedback('success', 'Invite code copied to clipboard!');
    });
  }

  canEditRole(member: OrganizationMember): boolean {
    const myRole = this.orgService.myRole();
    const currentUserId = this.authService.currentUser()?._id;
    const memberId = typeof member.user === 'object' ? member.user._id : member.user;

    if (currentUserId === memberId) return false;

    if (myRole === 'OWNER') return true;
    if (myRole === 'ADMIN') {

      return member.role !== 'OWNER' && member.role !== 'ADMIN';
    }
    return false;
  }

  canRemoveMember(member: OrganizationMember): boolean {
    const myRole = this.orgService.myRole();
    const currentUserId = this.authService.currentUser()?._id;
    const memberId = typeof member.user === 'object' ? member.user._id : member.user;

    if (currentUserId === memberId) return true;

    if (myRole === 'OWNER') return true;
    if (myRole === 'ADMIN') {
      return member.role !== 'OWNER' && member.role !== 'ADMIN';
    }
    return false;
  }

  private showFeedback(type: 'success' | 'error', text: string): void {
    this.actionFeedback.set({ type, text });
    setTimeout(() => {
      if (this.actionFeedback()?.text === text) {
        this.actionFeedback.set(null);
      }
    }, 4000);
  }
}
