import { Injectable } from '@nestjs/common';
import { Express } from 'express';
import { supabase } from '../auth/supabase.client';
import { GlovoAddressBookService } from '../logistics/adapters/glovo.addressbook';
import { WalletService } from './wallet.service';
import { AppLogger } from '../utils/logger.service';


@Injectable()
export class BusinessService {
  private readonly logger = new AppLogger(BusinessService.name);

  constructor(
    private glovoAddressBook: GlovoAddressBookService,
    private walletService: WalletService,
  ) {}
  // Call this after business is created to create wallet
  async createBusinessWallet(business: any) {
    // business: { id, email, business_name, phone, supabase_user_id }
    return this.walletService.createWalletForUser(
      business.supabase_user_id || business.id,
      {
        email: business.email,
        first_name: business.business_name,
        last_name: '',
      }
    );
  }

  async updateBusinessWithGlovoAddressBook(id: string, updateDto: any, file?: Express.Multer.File) {
    // Handle profile image upload if file is present
    if (file) {
      try {
        const mimeType = file.mimetype;
        const fileExt = mimeType.split('/')[1] || 'png';
        const fileName = `profile-images/${id}_${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('profile-images')
          .upload(fileName, file.buffer, { contentType: mimeType, upsert: true });
        if (uploadError) {
          console.error('[BusinessService] Error uploading profile image:', uploadError);
          throw uploadError;
        }
        const { data: publicUrlData } = supabase.storage
          .from('profile-images')
          .getPublicUrl(fileName);
        const publicUrl = publicUrlData?.publicUrl;
        if (publicUrl) {
          updateDto.profile_picture = publicUrl;
        }
      } catch (err) {
        this.logger.error('Exception during image upload', err);
        throw err;
      }
    }
    // Prevent phone number from being updated
    if ('phone' in updateDto) {
      delete updateDto.phone;
    }
    // If pickup_address is being updated, handle Glovo addressBookId
    this.logger.logBusiness('updateBusinessWithGlovoAddressBook called', { businessId: id, updateDto });
    let glovoAddressBookId = updateDto.glovoAddressBookId;
    // Always fetch the current business from DB to get the latest glovo_address_book_id
    const { data: currentBusiness, error: fetchError } = await supabase
      .from('business')
      .select('glovo_address_book_id, business_name, phone, pickup_address, pickup_contact_number')
      .eq('id', id)
      .single();
    if (fetchError) {
      console.error('[BusinessService] Error fetching business from Supabase:', fetchError);
      throw fetchError;
    }
    // Use DB value if not provided in updateDto
    if (typeof glovoAddressBookId === 'undefined') {
      glovoAddressBookId = currentBusiness?.glovo_address_book_id || null;
    }
    // If pickup_address is being updated, handle Glovo logic
    const pickupAddress = updateDto.pickup_address || currentBusiness?.pickup_address;
    if (pickupAddress) {
      // Lookup-only: do NOT create here to avoid 409s and cross-account conflicts
      this.logger.logBusiness('Lookup Glovo addressBookId from cache for pickup address');
      const cachedId = await this.glovoAddressBook.lookupAddressBookIdByAddress(pickupAddress);
      if (cachedId) {
        glovoAddressBookId = cachedId;
        this.logger.logBusiness('Found cached glovoAddressBookId', { glovoAddressBookId });
        updateDto.glovoAddressBookId = glovoAddressBookId;
      } else {
        this.logger.logBusiness('No cached glovoAddressBookId found; creating via GlovoAddressBookService.getOrCreateGlobalAddressBookId');
        try {
          const createdId = await this.glovoAddressBook.getOrCreateGlobalAddressBookId(pickupAddress);
          if (createdId) {
            glovoAddressBookId = createdId;
            updateDto.glovoAddressBookId = createdId;
            this.logger.logBusiness('Created glovoAddressBookId and updated profile', { glovoAddressBookId: createdId });
          } else {
            this.logger.logBusiness('Glovo address creation returned null (likely 409/conflict); proceeding without Glovo ID');
          }
        } catch (e) {
          this.logger.error('Failed to create Glovo addressBookId during profile update', e);
        }
      }
    } else {
      this.logger.logBusiness('pickup_address or phone not present, skipping Glovo logic');
    }
    // Map camelCase to snake_case for DB and fix name -> business_name
    const dbUpdate: any = { ...updateDto, updated_at: new Date().toISOString() };
    if ('name' in dbUpdate) {
      dbUpdate.business_name = dbUpdate.name;
      delete dbUpdate.name;
    }
    if ('glovoAddressBookId' in dbUpdate) {
      dbUpdate.glovo_address_book_id = dbUpdate.glovoAddressBookId;
      delete dbUpdate.glovoAddressBookId;
    }
    this.logger.logBusiness('Updating business in Supabase', dbUpdate);
    const { data, error } = await supabase
      .from('business')
      .update(dbUpdate)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      this.logger.error('Error updating business in Supabase', error);
      throw error;
    }
    this.logger.logBusiness('Updated business data', data);
    return data;
  }
}
