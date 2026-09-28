import { Pipe, PipeTransform } from '@angular/core';
import { resolveMediaUrl } from '../utils/media-url.util';

@Pipe({
  name: 'mediaUrl',
  standalone: true
})
export class MediaUrlPipe implements PipeTransform {
  transform(value?: string | null): string {
    return resolveMediaUrl(value);
  }
}
