import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateElectionDialogComponent } from './create-election-dialog.component';

describe('CreateElectionDialogComponent', () => {
  let component: CreateElectionDialogComponent;
  let fixture: ComponentFixture<CreateElectionDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateElectionDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateElectionDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
