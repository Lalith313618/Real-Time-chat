import {
  Component,
  OnInit,
  inject,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../core/models/user.model';
import { MediaUrlPipe } from '../../../core/pipes/media-url.pipe';
import { resolveMediaUrl } from '../../../core/utils/media-url.util';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, MediaUrlPipe],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.css'
})
export class UserProfileComponent implements OnInit {
  readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);

  @ViewChild('cropCanvas') cropCanvasRef?: ElementRef<HTMLCanvasElement>;

  user = signal<User | null>(null);
  nameInput = signal<string>('');
  imageUrlInput = signal<string>('');
  avatarLoadFailed = signal<boolean>(false);

  // Workplace profile fields
  jobTitleInput = signal<string>('');
  departmentInput = signal<string>('');
  bioInput = signal<string>('');
  phoneInput = signal<string>('');
  statusMessageInput = signal<string>('');
  statusEmojiInput = signal<string>('💻');
  presenceStatusInput = signal<'available' | 'busy' | 'away' | 'offline'>('available');

  // Selected file state
  selectedFile = signal<File | null>(null);
  selectedFileName = signal<string>('');
  selectedFileSize = signal<string>('');
  isDragging = signal<boolean>(false);
  showUrlInput = signal<boolean>(false);

  // Manual Adjust Modal state
  isAdjustModalOpen = signal<boolean>(false);
  adjustImageSource = signal<string | null>(null);
  zoomLevel = signal<number>(1);
  rotation = signal<number>(0);
  panOffset = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  isDraggingCanvas = signal<boolean>(false);
  private dragStartPos = { x: 0, y: 0 };
  private loadedImage: HTMLImageElement | null = null;
  isUploadingAdjusted = signal<boolean>(false);

  // General state
  isSaving = signal<boolean>(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  // Preset avatar choices
  presetAvatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
  ];

  ngOnInit(): void {
    const current = this.authService.currentUser();
    if (current) {
      this.user.set(current);
      this.nameInput.set(current.name);
      this.imageUrlInput.set(resolveMediaUrl(current.profileImage) || '');
      this.jobTitleInput.set(current.jobTitle || '');
      this.departmentInput.set(current.department || '');
      this.bioInput.set(current.bio || '');
      this.phoneInput.set(current.phone || '');
      this.statusMessageInput.set(current.statusMessage || '');
      this.statusEmojiInput.set(current.statusEmoji || '💻');
      this.presenceStatusInput.set(current.presenceStatus || 'available');
      this.avatarLoadFailed.set(false);
    }
  }

  triggerFileInput(inputElement: HTMLInputElement): void {
    inputElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
      input.value = ''; // Reset input to allow re-selection
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  private handleFile(file: File): void {
    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Please select a valid image file (PNG, JPG, JPEG, WEBP, GIF)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage.set('Image size exceeds 10MB limit. Please choose a smaller image.');
      return;
    }

    this.errorMessage.set(null);
    this.selectedFile.set(file);
    this.selectedFileName.set(file.name);
    this.selectedFileSize.set(this.formatFileSize(file.size));

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        // Automatically open the manual adjust modal for the selected image
        this.openAdjustModal(result, file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Open adjustment modal
  openAdjustModal(imageSrc?: string, fileName?: string): void {
    const rawSrc = imageSrc || this.imageUrlInput();
    const src = resolveMediaUrl(rawSrc);
    if (!src) {
      this.errorMessage.set('No image selected to adjust. Please upload an image first.');
      return;
    }

    this.adjustImageSource.set(src);
    this.selectedFileName.set(fileName || 'Profile Image');
    this.zoomLevel.set(1);
    this.rotation.set(0);
    this.panOffset.set({ x: 0, y: 0 });
    this.isAdjustModalOpen.set(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.loadedImage = img;
      setTimeout(() => this.renderCropCanvas(), 60);
    };
    img.onerror = () => {
      this.errorMessage.set('Failed to load image for adjustment');
      this.closeAdjustModal();
    };
    img.src = src;
  }

  closeAdjustModal(): void {
    this.isAdjustModalOpen.set(false);
    this.adjustImageSource.set(null);
    this.loadedImage = null;
    this.isDraggingCanvas.set(false);
  }

  // Canvas drawing & manual adjust controls
  renderCropCanvas(): void {
    const canvas = this.cropCanvasRef?.nativeElement;
    if (!canvas || !this.loadedImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const circleRadius = 130;

    ctx.clearRect(0, 0, width, height);

    const imgW = this.loadedImage.naturalWidth || this.loadedImage.width;
    const imgH = this.loadedImage.naturalHeight || this.loadedImage.height;
    const baseScale = Math.max((circleRadius * 2) / imgW, (circleRadius * 2) / imgH);
    const scale = baseScale * this.zoomLevel();

    // 1. Draw transformed image
    ctx.save();
    ctx.translate(centerX + this.panOffset().x, centerY + this.panOffset().y);
    ctx.rotate((this.rotation() * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(this.loadedImage, -imgW / 2, -imgH / 2, imgW, imgH);
    ctx.restore();

    // 2. Draw circular cutout mask
    ctx.save();
    ctx.fillStyle = 'rgba(23, 18, 12, 0.65)';
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Draw circle outline guide
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#CCA25A';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Subtle alignment crosshairs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - circleRadius);
    ctx.lineTo(centerX, centerY + circleRadius);
    ctx.moveTo(centerX - circleRadius, centerY);
    ctx.lineTo(centerX + circleRadius, centerY);
    ctx.stroke();

    ctx.restore();
  }

  startDrag(event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    this.isDraggingCanvas.set(true);
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    this.dragStartPos = {
      x: clientX - this.panOffset().x,
      y: clientY - this.panOffset().y
    };
  }

  onDrag(event: MouseEvent | TouchEvent): void {
    if (!this.isDraggingCanvas()) return;
    event.preventDefault();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    this.panOffset.set({
      x: clientX - this.dragStartPos.x,
      y: clientY - this.dragStartPos.y
    });
    this.renderCropCanvas();
  }

  endDrag(): void {
    this.isDraggingCanvas.set(false);
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    const newZoom = Math.min(3, Math.max(1, Math.round((this.zoomLevel() + delta) * 100) / 100));
    this.zoomLevel.set(newZoom);
    this.renderCropCanvas();
  }

  onZoomChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.zoomLevel.set(parseFloat(input.value));
    this.renderCropCanvas();
  }

  zoomIn(): void {
    this.zoomLevel.update((z) => Math.min(3, Math.round((z + 0.1) * 10) / 10));
    this.renderCropCanvas();
  }

  zoomOut(): void {
    this.zoomLevel.update((z) => Math.max(1, Math.round((z - 0.1) * 10) / 10));
    this.renderCropCanvas();
  }

  rotateClockwise(): void {
    this.rotation.update((r) => (r + 90) % 360);
    this.renderCropCanvas();
  }

  resetAdjustment(): void {
    this.zoomLevel.set(1);
    this.rotation.set(0);
    this.panOffset.set({ x: 0, y: 0 });
    this.renderCropCanvas();
  }

  // Export cropped circle image and upload
  applyAndUploadAdjustedAvatar(): void {
    if (!this.loadedImage) return;

    const exportSize = 400; // High-resolution avatar
    const offscreen = document.createElement('canvas');
    offscreen.width = exportSize;
    offscreen.height = exportSize;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    const circleRadiusInCanvas = 130;
    const ratio = exportSize / (circleRadiusInCanvas * 2); // 400 / 260

    const imgW = this.loadedImage.naturalWidth || this.loadedImage.width;
    const imgH = this.loadedImage.naturalHeight || this.loadedImage.height;
    const baseScale = Math.max((circleRadiusInCanvas * 2) / imgW, (circleRadiusInCanvas * 2) / imgH);
    const scale = baseScale * this.zoomLevel() * ratio;

    // Draw circular clip on export canvas
    ctx.save();
    ctx.beginPath();
    ctx.arc(exportSize / 2, exportSize / 2, exportSize / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(
      exportSize / 2 + this.panOffset().x * ratio,
      exportSize / 2 + this.panOffset().y * ratio
    );
    ctx.rotate((this.rotation() * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(this.loadedImage, -imgW / 2, -imgH / 2, imgW, imgH);
    ctx.restore();

    this.isUploadingAdjusted.set(true);
    this.errorMessage.set(null);

    offscreen.toBlob((blob) => {
      if (!blob) {
        this.isUploadingAdjusted.set(false);
        this.errorMessage.set('Failed to generate image preview');
        return;
      }

      this.userService.uploadAvatar(blob).subscribe({
        next: (res) => {
          const resolved = resolveMediaUrl(res.fileUrl);
          const normalizedUser = {
            ...res.user,
            profileImage: resolved
          };
          this.isUploadingAdjusted.set(false);
          this.user.set(normalizedUser);
          this.authService.updateCurrentUser(normalizedUser);
          this.imageUrlInput.set(resolved);
          this.avatarLoadFailed.set(false);
          this.selectedFile.set(null);
          this.selectedFileName.set('');
          this.selectedFileSize.set('');
          this.closeAdjustModal();
          this.successMessage.set('Profile picture adjusted and saved successfully!');
          setTimeout(() => this.successMessage.set(null), 4000);
        },
        error: (err) => {
          this.isUploadingAdjusted.set(false);
          this.errorMessage.set(err?.message || 'Failed to upload adjusted avatar');
        }
      });
    }, 'image/jpeg', 0.92);
  }

  // Permanently remove avatar from database and local state
  removeAvatar(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.userService.removeAvatar().subscribe({
      next: (updatedUser) => {
        this.user.set(updatedUser);
        this.authService.currentUser.set(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
        this.imageUrlInput.set('');
        this.selectedFile.set(null);
        this.selectedFileName.set('');
        this.selectedFileSize.set('');
        this.isSaving.set(false);
        this.successMessage.set('Profile picture removed successfully!');
        setTimeout(() => this.successMessage.set(null), 3500);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(err?.message || 'Failed to remove profile picture');
      }
    });
  }

  removeSelectedFile(): void {
    this.selectedFile.set(null);
    this.selectedFileName.set('');
    this.selectedFileSize.set('');
    const current = this.user();
    this.imageUrlInput.set(current?.profileImage || '');
  }

  selectAvatar(url: string): void {
    this.selectedFile.set(null);
    this.selectedFileName.set('');
    this.selectedFileSize.set('');
    this.imageUrlInput.set(resolveMediaUrl(url));
    this.avatarLoadFailed.set(false);
  }

  clearAvatar(): void {
    this.removeAvatar();
  }

  toggleUrlInput(): void {
    this.showUrlInput.update((val) => !val);
  }

  onSave(): void {
    if (!this.nameInput().trim()) {
      this.errorMessage.set('Name cannot be empty');
      return;
    }

    this.isSaving.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);

    const file = this.selectedFile();
    const profilePayload = {
      name: this.nameInput().trim(),
      jobTitle: this.jobTitleInput().trim(),
      department: this.departmentInput().trim(),
      bio: this.bioInput().trim(),
      phone: this.phoneInput().trim(),
      statusMessage: this.statusMessageInput().trim(),
      statusEmoji: this.statusEmojiInput().trim() || '💻',
      presenceStatus: this.presenceStatusInput(),
    };

    if (file) {
      this.userService.uploadAvatar(file).subscribe({
        next: (uploadRes) => {
          this.userService
            .updateProfile({
              ...profilePayload,
              profileImage: uploadRes.fileUrl,
            })
            .subscribe({
              next: (updatedUser) => {
                this.finalizeSave(updatedUser);
              },
              error: (err) => {
                this.isSaving.set(false);
                this.errorMessage.set(err?.message || 'Failed to update profile details');
              },
            });
        },
        error: (err) => {
          this.isSaving.set(false);
          this.errorMessage.set(err?.message || 'Failed to upload profile image');
        },
      });
    } else {
      this.userService
        .updateProfile({
          ...profilePayload,
          profileImage: this.imageUrlInput().trim(),
        })
        .subscribe({
          next: (updatedUser) => {
            this.finalizeSave(updatedUser);
          },
          error: (err) => {
            this.isSaving.set(false);
            this.errorMessage.set(err?.message || 'Failed to update profile');
          },
        });
    }
  }

  onAvatarError(): void {
    this.avatarLoadFailed.set(true);
  }

  private finalizeSave(updatedUser: User): void {
    const resolvedUrl = resolveMediaUrl(updatedUser.profileImage);
    const normalizedUser = {
      ...updatedUser,
      profileImage: resolvedUrl
    };
    this.user.set(normalizedUser);
    this.authService.updateCurrentUser(normalizedUser);
    this.imageUrlInput.set(resolvedUrl || '');
    this.avatarLoadFailed.set(false);
    this.selectedFile.set(null);
    this.selectedFileName.set('');
    this.selectedFileSize.set('');
    this.isSaving.set(false);
    this.successMessage.set('Profile updated successfully!');
    setTimeout(() => this.successMessage.set(null), 4000);
  }
}
