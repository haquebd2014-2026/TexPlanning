const UnifiedOrder = require('../models/UnifiedOrder');

/**
 * GET /api/orders
 * Retrieves unified orders with pagination, filtering (buyer, style, status, search),
 * buyer-level access restrictions, and returns consolidated data with:
 * generalInfo, knittingPlan, dyeingPlan, and deliveryPlan.
 */
async function getUnifiedOrders(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { buyer, style, status, orderNo, search } = req.query;

    const filter = {};

    // Enforce buyer scope if user is non-admin
    if (req.user && req.user.role !== 'Admin') {
      const allowedBuyers = Array.isArray(req.user.allowedBuyers) ? req.user.allowedBuyers : [];
      if (buyer) {
        if (!allowedBuyers.includes(buyer)) {
          return res.status(200).json({
            success: true,
            pagination: { total: 0, page, limit, totalPages: 0 },
            data: []
          });
        }
        filter.buyer = buyer;
      } else {
        filter.buyer = { $in: allowedBuyers };
      }
    } else if (buyer) {
      filter.buyer = { $regex: new RegExp(buyer.trim(), 'i') };
    }

    if (style) {
      filter.style = { $regex: new RegExp(style.trim(), 'i') };
    }

    if (status) {
      filter.$or = [
        { overallStatus: { $regex: new RegExp(status.trim(), 'i') } },
        { status: { $regex: new RegExp(status.trim(), 'i') } }
      ];
    }

    if (orderNo) {
      filter.orderNo = { $regex: new RegExp(orderNo.trim(), 'i') };
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { orderNo: searchRegex },
        { buyer: searchRegex },
        { style: searchRegex },
        { 'generalInfo.fabricNotes': searchRegex },
        { fabricNotes: searchRegex }
      ];
    }

    const totalOrders = await UnifiedOrder.countDocuments(filter);
    const orders = await UnifiedOrder.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    // Format into consolidated structure
    const consolidatedData = orders.map((order) => {
      const generalInfo = {
        buyer: order.generalInfo?.buyer || order.buyer || '',
        style: order.generalInfo?.style || order.style || '',
        season: order.generalInfo?.season || order.season || '',
        bookingDate: order.generalInfo?.bookingDate || order.bookingDate || null,
        totalOrderQty: order.generalInfo?.totalOrderQty || order.totalOrderQty || 0,
        firstShipDate: order.generalInfo?.firstShipDate || order.firstShipDate || null,
        lastShipDate: order.generalInfo?.lastShipDate || order.lastShipDate || null,
        fabricNotes: order.generalInfo?.fabricNotes || order.fabricNotes || ''
      };

      return {
        _id: order._id,
        orderNo: order.orderNo,
        overallStatus: order.overallStatus || order.status || 'Pending',
        generalInfo,
        knittingPlan: order.knittingPlan || [],
        dyeingPlan: order.dyeingPlan || [],
        deliveryPlan: order.deliveryPlan || [],
        fabricItems: order.fabricItems || [],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    });

    return res.status(200).json({
      success: true,
      pagination: {
        total: totalOrders,
        page,
        limit,
        totalPages: Math.ceil(totalOrders / limit)
      },
      data: consolidatedData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve unified orders.',
      error: error.message
    });
  }
}

/**
 * PUT /api/orders/:id
 * Updates knittingPlan, dyeingPlan, deliveryPlan, and overallStatus
 * for an order in a single synchronized update using findByIdAndUpdate.
 */
async function updateUnifiedPlan(req, res) {
  try {
    const { id } = req.params;
    const { knittingPlan, dyeingPlan, deliveryPlan, overallStatus, generalInfo } = req.body;

    // Check existing order
    const existingOrder = await UnifiedOrder.findById(id);
    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    // Check non-admin user buyer permissions
    if (req.user && req.user.role !== 'Admin') {
      const allowedBuyers = Array.isArray(req.user.allowedBuyers) ? req.user.allowedBuyers : [];
      if (!allowedBuyers.includes(existingOrder.buyer)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You do not have permission to modify orders for this buyer.'
        });
      }
    }

    const updateFields = {};

    if (knittingPlan !== undefined) {
      updateFields.knittingPlan = Array.isArray(knittingPlan) ? knittingPlan : [];
    }

    if (dyeingPlan !== undefined) {
      updateFields.dyeingPlan = Array.isArray(dyeingPlan) ? dyeingPlan : [];
    }

    if (deliveryPlan !== undefined) {
      updateFields.deliveryPlan = Array.isArray(deliveryPlan) ? deliveryPlan : [];
    }

    if (overallStatus !== undefined) {
      updateFields.overallStatus = overallStatus;
      updateFields.status = overallStatus;
    }

    if (generalInfo !== undefined && typeof generalInfo === 'object') {
      updateFields.generalInfo = {
        ...existingOrder.generalInfo?.toObject(),
        ...generalInfo
      };
      if (generalInfo.buyer) updateFields.buyer = generalInfo.buyer;
      if (generalInfo.style) updateFields.style = generalInfo.style;
      if (generalInfo.season) updateFields.season = generalInfo.season;
      if (generalInfo.bookingDate) updateFields.bookingDate = generalInfo.bookingDate;
      if (generalInfo.totalOrderQty !== undefined) updateFields.totalOrderQty = generalInfo.totalOrderQty;
      if (generalInfo.firstShipDate) updateFields.firstShipDate = generalInfo.firstShipDate;
      if (generalInfo.lastShipDate) updateFields.lastShipDate = generalInfo.lastShipDate;
      if (generalInfo.fabricNotes) updateFields.fabricNotes = generalInfo.fabricNotes;
    }

    const updatedOrder = await UnifiedOrder.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    const consolidatedResponse = {
      _id: updatedOrder._id,
      orderNo: updatedOrder.orderNo,
      overallStatus: updatedOrder.overallStatus || updatedOrder.status || 'Pending',
      generalInfo: {
        buyer: updatedOrder.generalInfo?.buyer || updatedOrder.buyer || '',
        style: updatedOrder.generalInfo?.style || updatedOrder.style || '',
        season: updatedOrder.generalInfo?.season || updatedOrder.season || '',
        bookingDate: updatedOrder.generalInfo?.bookingDate || updatedOrder.bookingDate || null,
        totalOrderQty: updatedOrder.generalInfo?.totalOrderQty || updatedOrder.totalOrderQty || 0,
        firstShipDate: updatedOrder.generalInfo?.firstShipDate || updatedOrder.firstShipDate || null,
        lastShipDate: updatedOrder.generalInfo?.lastShipDate || updatedOrder.lastShipDate || null,
        fabricNotes: updatedOrder.generalInfo?.fabricNotes || updatedOrder.fabricNotes || ''
      },
      knittingPlan: updatedOrder.knittingPlan || [],
      dyeingPlan: updatedOrder.dyeingPlan || [],
      deliveryPlan: updatedOrder.deliveryPlan || [],
      fabricItems: updatedOrder.fabricItems || [],
      createdAt: updatedOrder.createdAt,
      updatedAt: updatedOrder.updatedAt
    };

    return res.status(200).json({
      success: true,
      message: 'Unified order plan successfully updated.',
      data: consolidatedResponse
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update unified order plan.',
      error: error.message
    });
  }
}

module.exports = {
  getUnifiedOrders,
  updateUnifiedPlan
};
