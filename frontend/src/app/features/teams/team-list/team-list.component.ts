import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService } from '../../../core/services/team.service';
import { ChannelService } from '../../../core/services/channel.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/services/auth.service';
import { Team, TeamMember, TeamRole, TeamPrivacy } from '../../../core/models/team.model';
import { Channel, ChannelType, ChannelMember } from '../../../core/models/channel.model';
import { User } from '../../../core/models/user.model';
import { RouterLink } from '@angular/router';
import { MediaUrlPipe } from '../../../core/pipes/media-url.pipe';

@Component({
  selector: 'app-team-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MediaUrlPipe],
  templateUrl: './team-list.component.html',
  styleUrl: './team-list.component.css',
})
export class TeamListComponent implements OnInit {
  readonly teamService = inject(TeamService);
  readonly channelService = inject(ChannelService);
  readonly orgService = inject(OrganizationService);
  readonly authService = inject(AuthService);

  // Filter & Search
  searchQuery = signal<string>('');
  privacyFilter = signal<'ALL' | 'MY_TEAMS' | 'PUBLIC' | 'PRIVATE'>('ALL');

  // Drawer & Tabs
  isManageDrawerOpen = signal<boolean>(false);
  drawerTab = signal<'channels' | 'members'>('channels');

  // Modals state
  isCreateModalOpen = signal<boolean>(false);
  isAddMemberModalOpen = signal<boolean>(false);
  isCreateChannelModalOpen = signal<boolean>(false);
  isChannelDetailsModalOpen = signal<boolean>(false);
  isAddChannelMemberOpen = signal<boolean>(false);

  // Active selected team for details/management
  selectedTeam = signal<Team | null>(null);

  // Active selected channel for details/management
  selectedChannel = signal<Channel | null>(null);

  // Channels state
  channels = signal<Channel[]>([]);
  isLoadingChannels = signal<boolean>(false);
  channelSearchQuery = signal<string>('');
  channelTypeFilter = signal<'ALL' | 'PUBLIC' | 'PRIVATE'>('ALL');

  // Create Channel form
  newChannelName = signal<string>('');
  newChannelDisplayName = signal<string>('');
  newChannelDesc = signal<string>('');
  newChannelTopic = signal<string>('');
  newChannelType = signal<ChannelType>('PUBLIC');
  selectedChannelMembers = signal<string[]>([]);
  isCreatingChannel = signal<boolean>(false);
  createChannelError = signal<string>('');

  // Edit Channel form
  editChannelDisplayName = signal<string>('');
  editChannelTopic = signal<string>('');
  editChannelDesc = signal<string>('');
  isEditingChannel = signal<boolean>(false);
  editChannelError = signal<string>('');

  // Add Member to Channel form
  selectedChannelUserToAdd = signal<User | null>(null);
  addChannelMemberQuery = signal<string>('');
  isAddingChannelMember = signal<boolean>(false);
  addChannelMemberError = signal<string>('');

  // Create form
  newTeamName = signal<string>('');
  newTeamDesc = signal<string>('');
  newTeamPrivacy = signal<TeamPrivacy>('PUBLIC');
  selectedInitialMembers = signal<string[]>([]);
  isCreating = signal<boolean>(false);
  createError = signal<string>('');

  // Add member form
  addMemberQuery = signal<string>('');
  addMemberRole = signal<TeamRole>('MEMBER');
  selectedUserToAdd = signal<User | null>(null);
  isAddingMember = signal<boolean>(false);
  addMemberError = signal<string>('');

  // Action status feedback
  actionFeedback = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  // Available organization members to add to teams
  readonly orgMembers = computed<User[]>(() => {
    const org = this.orgService.currentOrganization();
    if (!org || !org.members) return [];
    return org.members
      .map((m) => m.user)
      .filter((u): u is User => Boolean(u && typeof u === 'object'));
  });

  readonly filteredTeams = computed<Team[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filter = this.privacyFilter();
    let teams = this.teamService.teams();

    if (filter === 'MY_TEAMS') {
      teams = teams.filter((t) => t.isMember);
    } else if (filter === 'PUBLIC') {
      teams = teams.filter((t) => t.privacy === 'PUBLIC');
    } else if (filter === 'PRIVATE') {
      teams = teams.filter((t) => t.privacy === 'PRIVATE');
    }

    if (query) {
      teams = teams.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          (t.description && t.description.toLowerCase().includes(query))
      );
    }

    return teams;
  });

  readonly stats = computed(() => {
    const all = this.teamService.teams();
    return {
      total: all.length,
      joined: all.filter((t) => t.isMember).length,
      publicCount: all.filter((t) => t.privacy === 'PUBLIC').length,
      privateCount: all.filter((t) => t.privacy === 'PRIVATE').length,
    };
  });

  readonly currentTeamMembers = computed<User[]>(() => {
    const team = this.selectedTeam();
    if (!team || !team.members) return [];
    return team.members
      .map((m) => m.user)
      .filter((u): u is User => Boolean(u && typeof u === 'object'));
  });

  readonly filteredChannels = computed<Channel[]>(() => {
    const q = this.channelSearchQuery().toLowerCase().trim();
    const typeFilter = this.channelTypeFilter();
    let list = this.channels();

    if (typeFilter === 'PUBLIC') {
      list = list.filter((c) => c.type === 'PUBLIC');
    } else if (typeFilter === 'PRIVATE') {
      list = list.filter((c) => c.type === 'PRIVATE');
    }

    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.displayName && c.displayName.toLowerCase().includes(q)) ||
          (c.topic && c.topic.toLowerCase().includes(q)) ||
          (c.description && c.description.toLowerCase().includes(q))
      );
    }

    return list;
  });

  readonly availableTeamMembersForSelectedChannel = computed<User[]>(() => {
    const channel = this.selectedChannel();
    if (!channel) return [];
    const existingMemberIds = new Set(
      channel.members.map((m) => (typeof m.user === 'object' ? m.user._id : m.user))
    );
    const query = this.addChannelMemberQuery().toLowerCase().trim();

    return this.currentTeamMembers().filter((u) => {
      if (existingMemberIds.has(u._id)) return false;
      if (!query) return true;
      return u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
    });
  });

  readonly availableRoles: TeamRole[] = ['LEAD', 'ADMIN', 'MEMBER'];

  ngOnInit(): void {
    this.loadTeams();
  }

  loadTeams(): void {
    const currentOrg = this.orgService.currentOrganization();
    this.teamService.loadTeams(currentOrg?._id).subscribe();
  }

  // Create Team
  openCreateModal(): void {
    this.newTeamName.set('');
    this.newTeamDesc.set('');
    this.newTeamPrivacy.set('PUBLIC');
    this.selectedInitialMembers.set([]);
    this.createError.set('');
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  toggleInitialMember(userId: string): void {
    this.selectedInitialMembers.update((list) => {
      if (list.includes(userId)) {
        return list.filter((id) => id !== userId);
      }
      return [...list, userId];
    });
  }

  submitCreateTeam(): void {
    const name = this.newTeamName().trim();
    if (!name || name.length < 2) {
      this.createError.set('Team name must be at least 2 characters');
      return;
    }

    const currentOrg = this.orgService.currentOrganization();
    if (!currentOrg) {
      this.createError.set('No active organization selected');
      return;
    }

    this.isCreating.set(true);
    this.createError.set('');

    this.teamService
      .createTeam({
        name,
        description: this.newTeamDesc().trim(),
        privacy: this.newTeamPrivacy(),
        organizationId: currentOrg._id,
        initialMemberIds: this.selectedInitialMembers(),
      })
      .subscribe({
        next: (created) => {
          this.isCreating.set(false);
          this.closeCreateModal();
          this.showFeedback('success', `Team "${created.name}" created successfully!`);
        },
        error: (err) => {
          this.isCreating.set(false);
          this.createError.set(err.error?.message || 'Failed to create team');
        },
      });
  }

  // Join Public Team
  joinTeam(team: Team): void {
    this.teamService.joinTeam(team._id).subscribe({
      next: () => {
        this.showFeedback('success', `You joined "${team.name}"!`);
      },
      error: (err) => {
        this.showFeedback('error', err.error?.message || 'Failed to join team');
      },
    });
  }

  // Open Team Detail / Manage Drawer
  openTeamDetails(team: Team): void {
    this.teamService.getTeamById(team._id).subscribe({
      next: (fullTeam) => {
        this.selectedTeam.set(fullTeam);
        this.drawerTab.set('channels');
        this.isManageDrawerOpen.set(true);
        this.loadChannelsForTeam(fullTeam._id);
      },
      error: (err) => {
        this.showFeedback('error', err.error?.message || 'Failed to load team details');
      },
    });
  }

  closeTeamDetails(): void {
    this.isManageDrawerOpen.set(false);
    this.selectedTeam.set(null);
    this.channels.set([]);
  }

  // Load channels for the active team
  loadChannelsForTeam(teamId: string): void {
    this.isLoadingChannels.set(true);
    this.channelService.loadTeamChannels(teamId).subscribe({
      next: (channels) => {
        this.channels.set(channels);
        this.isLoadingChannels.set(false);
      },
      error: (err) => {
        this.isLoadingChannels.set(false);
        this.showFeedback('error', err.error?.message || 'Failed to load team channels');
      },
    });
  }

  // Helper for live slug formatting
  cleanChannelSlug(input: string): string {
    return (input || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
      .slice(0, 80);
  }

  // Create Channel
  openCreateChannelModal(): void {
    this.newChannelName.set('');
    this.newChannelDisplayName.set('');
    this.newChannelDesc.set('');
    this.newChannelTopic.set('');
    this.newChannelType.set('PUBLIC');
    this.selectedChannelMembers.set([]);
    this.createChannelError.set('');
    this.isCreateChannelModalOpen.set(true);
  }

  closeCreateChannelModal(): void {
    this.isCreateChannelModalOpen.set(false);
  }

  toggleChannelMemberSelection(userId: string): void {
    this.selectedChannelMembers.update((list) => {
      if (list.includes(userId)) {
        return list.filter((id) => id !== userId);
      }
      return [...list, userId];
    });
  }

  submitCreateChannel(): void {
    const rawName = this.newChannelName().trim();
    const slug = this.cleanChannelSlug(rawName);
    if (!slug || slug.length < 2) {
      this.createChannelError.set('Channel name must be at least 2 alphanumeric characters');
      return;
    }

    const team = this.selectedTeam();
    if (!team) return;

    this.isCreatingChannel.set(true);
    this.createChannelError.set('');

    this.channelService
      .createChannel({
        name: slug,
        displayName: this.newChannelDisplayName().trim() || rawName,
        description: this.newChannelDesc().trim(),
        topic: this.newChannelTopic().trim(),
        teamId: team._id,
        type: this.newChannelType(),
        memberIds: this.selectedChannelMembers(),
      })
      .subscribe({
        next: (created) => {
          this.isCreatingChannel.set(false);
          this.closeCreateChannelModal();
          this.channels.update((list) => [...list, created]);
          this.showFeedback('success', `Channel #${created.name} created!`);
        },
        error: (err) => {
          this.isCreatingChannel.set(false);
          this.createChannelError.set(err.error?.message || 'Failed to create channel');
        },
      });
  }

  // Channel Details & Settings
  openChannelDetails(channel: Channel): void {
    this.channelService.getChannelById(channel._id).subscribe({
      next: (fullChan) => {
        this.selectedChannel.set(fullChan);
        this.editChannelDisplayName.set(fullChan.displayName || fullChan.name);
        this.editChannelTopic.set(fullChan.topic || '');
        this.editChannelDesc.set(fullChan.description || '');
        this.editChannelError.set('');
        this.isChannelDetailsModalOpen.set(true);
      },
      error: (err) => {
        this.showFeedback('error', err.error?.message || 'Failed to load channel details');
      },
    });
  }

  closeChannelDetails(): void {
    this.isChannelDetailsModalOpen.set(false);
    this.selectedChannel.set(null);
  }

  submitEditChannel(): void {
    const chan = this.selectedChannel();
    if (!chan) return;

    this.isEditingChannel.set(true);
    this.editChannelError.set('');

    this.channelService
      .updateChannel(chan._id, {
        displayName: this.editChannelDisplayName().trim(),
        topic: this.editChannelTopic().trim(),
        description: this.editChannelDesc().trim(),
      })
      .subscribe({
        next: (updated) => {
          this.isEditingChannel.set(false);
          this.selectedChannel.set(updated);
          this.channels.update((list) =>
            list.map((c) => (c._id === updated._id ? updated : c))
          );
          this.showFeedback('success', `Channel #${updated.name} updated!`);
        },
        error: (err) => {
          this.isEditingChannel.set(false);
          this.editChannelError.set(err.error?.message || 'Failed to update channel');
        },
      });
  }

  deleteChannel(channel: Channel): void {
    if (channel.isDefault) {
      this.showFeedback('error', 'The default #general channel cannot be deleted');
      return;
    }

    if (confirm(`Are you sure you want to permanently delete channel #${channel.name}?`)) {
      this.channelService.deleteChannel(channel._id).subscribe({
        next: () => {
          this.channels.update((list) => list.filter((c) => c._id !== channel._id));
          if (this.selectedChannel()?._id === channel._id) {
            this.closeChannelDetails();
          }
          this.showFeedback('success', `Channel #${channel.name} deleted`);
        },
        error: (err) => {
          this.showFeedback('error', err.error?.message || 'Failed to delete channel');
        },
      });
    }
  }

  // Add Member to Private Channel
  openAddChannelMemberModal(): void {
    this.selectedChannelUserToAdd.set(null);
    this.addChannelMemberQuery.set('');
    this.addChannelMemberError.set('');
    this.isAddChannelMemberOpen.set(true);
  }

  closeAddChannelMemberModal(): void {
    this.isAddChannelMemberOpen.set(false);
  }

  selectChannelUserToAdd(user: User): void {
    this.selectedChannelUserToAdd.set(user);
    this.addChannelMemberQuery.set(user.name);
  }

  submitAddChannelMember(): void {
    const chan = this.selectedChannel();
    const user = this.selectedChannelUserToAdd();
    if (!chan || !user) {
      this.addChannelMemberError.set('Please select a teammate');
      return;
    }

    this.isAddingChannelMember.set(true);
    this.addChannelMemberError.set('');

    this.channelService
      .addMember(chan._id, { userId: user._id, role: 'MEMBER' })
      .subscribe({
        next: (updated) => {
          this.isAddingChannelMember.set(false);
          this.selectedChannel.set(updated);
          this.channels.update((list) =>
            list.map((c) => (c._id === updated._id ? updated : c))
          );
          this.closeAddChannelMemberModal();
          this.showFeedback('success', `${user.name} added to #${chan.name}`);
        },
        error: (err) => {
          this.isAddingChannelMember.set(false);
          this.addChannelMemberError.set(err.error?.message || 'Failed to add member to channel');
        },
      });
  }

  removeChannelMember(member: ChannelMember): void {
    const chan = this.selectedChannel();
    if (!chan || !member.user) return;

    const currentUserId = this.authService.currentUser()?._id;
    const memberId = typeof member.user === 'object' ? member.user._id : member.user;
    const isSelf = currentUserId === memberId;

    const msg = isSelf
      ? `Leave channel #${chan.name}?`
      : `Remove ${member.user.name} from #${chan.name}?`;

    if (confirm(msg)) {
      this.channelService.removeMember(chan._id, memberId).subscribe({
        next: (updated) => {
          if (isSelf) {
            this.closeChannelDetails();
            this.channels.update((list) => list.filter((c) => c._id !== chan._id));
            this.showFeedback('success', `You left #${chan.name}`);
          } else {
            this.selectedChannel.set(updated);
            this.channels.update((list) =>
              list.map((c) => (c._id === updated._id ? updated : c))
            );
            this.showFeedback('success', 'Teammate removed from channel');
          }
        },
        error: (err) => {
          this.showFeedback('error', err.error?.message || 'Failed to remove member from channel');
        },
      });
    }
  }

  canManageChannel(channel?: Channel | null): boolean {
    if (!channel) return false;
    if (channel.myRole === 'ADMIN') return true;
    return this.canManageTeam(this.selectedTeam());
  }

  // Add Member to Team
  openAddMemberModal(): void {
    this.addMemberQuery.set('');
    this.addMemberRole.set('MEMBER');
    this.selectedUserToAdd.set(null);
    this.addMemberError.set('');
    this.isAddMemberModalOpen.set(true);
  }

  closeAddMemberModal(): void {
    this.isAddMemberModalOpen.set(false);
  }

  getAvailableOrgMembersForTeam(): User[] {
    const team = this.selectedTeam();
    if (!team) return [];
    const currentTeamMemberIds = new Set(
      team.members.map((m) => (typeof m.user === 'object' ? m.user._id : m.user))
    );
    const query = this.addMemberQuery().toLowerCase().trim();

    return this.orgMembers().filter((u) => {
      if (currentTeamMemberIds.has(u._id)) return false;
      if (!query) return true;
      return u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
    });
  }

  selectUserToAdd(user: User): void {
    this.selectedUserToAdd.set(user);
    this.addMemberQuery.set(user.name);
  }

  submitAddMember(): void {
    const team = this.selectedTeam();
    const user = this.selectedUserToAdd();
    if (!team || !user) {
      this.addMemberError.set('Please select an organization member');
      return;
    }

    this.isAddingMember.set(true);
    this.addMemberError.set('');

    this.teamService
      .addMember(team._id, {
        userId: user._id,
        role: this.addMemberRole(),
      })
      .subscribe({
        next: (updated) => {
          this.isAddingMember.set(false);
          this.selectedTeam.set(updated);
          this.closeAddMemberModal();
          this.showFeedback('success', `${user.name} added to ${team.name}`);
        },
        error: (err) => {
          this.isAddingMember.set(false);
          this.addMemberError.set(err.error?.message || 'Failed to add member');
        },
      });
  }

  // Change Member Role
  onChangeRole(member: TeamMember, newRole: TeamRole): void {
    const team = this.selectedTeam();
    if (!team || !member.user) return;
    const memberId = typeof member.user === 'object' ? member.user._id : member.user;

    this.teamService.changeMemberRole(team._id, memberId, newRole).subscribe({
      next: (updated) => {
        this.selectedTeam.set(updated);
        this.showFeedback('success', `Role updated to ${newRole}`);
      },
      error: (err) => {
        this.showFeedback('error', err.error?.message || 'Failed to update role');
      },
    });
  }

  // Remove Member or Leave
  confirmRemoveMember(member: TeamMember): void {
    const team = this.selectedTeam();
    if (!team || !member.user) return;

    const currentUserId = this.authService.currentUser()?._id;
    const memberId = typeof member.user === 'object' ? member.user._id : member.user;
    const isSelf = currentUserId === memberId;

    const msg = isSelf
      ? `Are you sure you want to leave team "${team.name}"?`
      : `Remove ${member.user.name} from "${team.name}"?`;

    if (confirm(msg)) {
      this.teamService.removeMember(team._id, memberId).subscribe({
        next: (updated) => {
          if (isSelf) {
            this.closeTeamDetails();
            this.showFeedback('success', `You have left "${team.name}"`);
          } else {
            this.selectedTeam.set(updated);
            this.showFeedback('success', 'Member removed from team');
          }
        },
        error: (err) => {
          this.showFeedback('error', err.error?.message || 'Failed to remove member');
        },
      });
    }
  }

  // Delete Team
  confirmDeleteTeam(team: Team): void {
    if (confirm(`Are you sure you want to permanently delete team "${team.name}"?`)) {
      this.teamService.deleteTeam(team._id).subscribe({
        next: () => {
          this.closeTeamDetails();
          this.showFeedback('success', `Team "${team.name}" has been deleted`);
        },
        error: (err) => {
          this.showFeedback('error', err.error?.message || 'Failed to delete team');
        },
      });
    }
  }

  canManageTeam(team?: Team | null): boolean {
    if (!team) return false;
    if (team.myRole === 'LEAD' || team.myRole === 'ADMIN') return true;
    return this.orgService.isOwnerOrAdmin();
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
