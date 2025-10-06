import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SHARED_IMPORTS } from '../../../shared-imports';

@Component({
  selector: 'app-add-candidate-dialog',
  imports: [
    SHARED_IMPORTS
  ],
  templateUrl: './add-candidate-dialog.component.html',
  styleUrl: './add-candidate-dialog.component.scss'
})
export class AddCandidateDialogComponent implements OnInit {
  candidateForm: FormGroup;
  previewUrl: string | null = null;
  
  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<AddCandidateDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { electionId: number, electionName: string }
  ) {
    this.candidateForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      party: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      imageUrl: ['', [Validators.pattern(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i)]]
    });
  }

  ngOnInit() {
    // Listen for image URL changes to update preview
    this.candidateForm.get('imageUrl')?.valueChanges.subscribe(url => {
      if (this.isValidImageUrl(url)) {
        this.previewUrl = url;
      } else {
        this.previewUrl = null;
      }
    });
  }

  onSubmit() {
    if (this.candidateForm.invalid) {
      return;
    }

    const formValue = this.candidateForm.value;
    
    this.dialogRef.close({
      name: formValue.name.trim(),
      party: formValue.party.trim(),
      imageUrl: formValue.imageUrl.trim() || ''
    });
  }

  onCancel() {
    this.dialogRef.close();
  }

  getErrorMessage(field: string): string {
    const control = this.candidateForm.get(field);
    
    if (control?.hasError('required')) {
      return 'Kjo fushë është e detyrueshme';
    }
    
    if (control?.hasError('minlength')) {
      const minLength = control.errors?.['minlength'].requiredLength;
      return `Minimumi ${minLength} karaktere`;
    }
    
    if (control?.hasError('maxlength')) {
      const maxLength = control.errors?.['maxlength'].requiredLength;
      return `Maksimumi ${maxLength} karaktere`;
    }
    
    if (control?.hasError('pattern')) {
      return 'URL e pavlefshme për imazhin (duhet të përfundojë me .jpg, .png, etj)';
    }
    
    return '';
  }

  isValidImageUrl(url: string): boolean {
    if (!url) return false;
    const pattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i;
    return pattern.test(url);
  }

  onImageError() {
    this.previewUrl = null;
  }

  getCandidateInitial(): string {
    const name = this.candidateForm.get('name')?.value;
    return name ? name.charAt(0).toUpperCase() : '?';
  }
}