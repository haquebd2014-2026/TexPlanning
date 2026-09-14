const xlsx = require('xlsx');
const UnifiedOrder = require('../models/UnifiedOrder');

/**
 * Normalizes a header string for flexible property matching.
 * e.g., "Order No." -> "orderno", "Fabric Construction" -> "fabricconstruction"
 */
function normalizeKey(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Maps raw Excel cell values to a normalized Date object or null.
 */
function parseExcelDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val;
  }
  if (typeof val === 'number') {
    // Excel serial date conversion
    const date = xlsx.SSF.parse_date_code(val);
    if (date) {
      return new Date(date.y, date.m - 1, date.d, date.H || 0, date.M || 0, date.S || 0);
    }
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Maps raw Excel cell values to a numeric quantity.
 */
function parseExcelNumber(val, defaultVal = 0) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const num = Number(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? defaultVal : num;
}

/**
 * POST /api/orders/upload-excel
 * Parses memory-buffered Excel spreadsheet or CSV, maps rows to UnifiedOrder structure,
 * and bulk writes upsert operations into MongoDB.
 */
async function processExcelUpload(req, res) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or file buffer is empty. Please upload a valid .xlsx, .xls, or .csv file.'
      });
    }

    // Parse workbook from memory buffer
    const workbook = xlsx.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false
    });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file contains no readable sheets.'
      });
    }

    const ordersMap = {};
    let totalRowsProcessed = 0;

    // Process each sheet in the workbook
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      // Convert sheet to array of row objects
      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!rawRows || rawRows.length === 0) continue;

      for (const row of rawRows) {
        totalRowsProcessed++;

        // Map row headers using normalized keys
        const rowMap = {};
        for (const [colName, colVal] of Object.entries(row)) {
          rowMap[normalizeKey(colName)] = colVal;
        }

        // Locate orderNo (required identifier)
        const orderNoVal = rowMap['orderno'] ||
          rowMap['order'] ||
          rowMap['ordernumber'] ||
          rowMap['pono'] ||
          rowMap['po'] ||
          rowMap['jobno'];

        if (!orderNoVal) {
          continue; // Skip rows without order reference
        }

        const orderNo = String(orderNoVal).trim();
        const buyer = String(rowMap['buyer'] || rowMap['buyername'] || rowMap['customer'] || 'Unknown Buyer').trim();
        const style = String(rowMap['style'] || rowMap['styleno'] || rowMap['stylename'] || '').trim();
        const season = String(rowMap['season'] || '').trim();
        const bookingDate = parseExcelDate(rowMap['bookingdate'] || rowMap['orderdate'] || rowMap['podate']);
        const totalOrderQty = parseExcelNumber(rowMap['totalorderqty'] || rowMap['orderqty'] || rowMap['qty'] || rowMap['totalqty']);
        const firstShipDate = parseExcelDate(rowMap['firstshipdate'] || rowMap['firstship'] || rowMap['exfactory1']);
        const lastShipDate = parseExcelDate(rowMap['lastshipdate'] || rowMap['lastship'] || rowMap['shipdate'] || rowMap['exfactorydate'] || rowMap['exfactory']);
        const fabricNotes = String(rowMap['fabricnotes'] || rowMap['yarncount'] || rowMap['notes'] || rowMap['remarks'] || '').trim();
        const overallStatus = String(rowMap['overallstatus'] || rowMap['deliverystatus'] || rowMap['status'] || 'Pending').trim();

        // Check buyer permissions if non-admin user
        if (req.user && req.user.role !== 'Admin') {
          const allowedBuyers = Array.isArray(req.user.allowedBuyers) ? req.user.allowedBuyers : [];
          if (!allowedBuyers.includes(buyer)) {
            continue; // Ignore rows for unauthorized buyers
          }
        }

        // Initialize order if not present in ordersMap
        if (!ordersMap[orderNo]) {
          ordersMap[orderNo] = {
            orderNo,
            buyer,
            style,
            season,
            bookingDate,
            totalOrderQty,
            firstShipDate,
            lastShipDate,
            fabricNotes,
            overallStatus,
            generalInfo: {
              buyer,
              style,
              season,
              bookingDate,
              totalOrderQty,
              firstShipDate,
              lastShipDate,
              fabricNotes
            },
            knittingPlan: [],
            dyeingPlan: [],
            deliveryPlan: [],
            fabricItems: []
          };
        } else {
          // Update order metadata if earlier row had blanks
          if (!ordersMap[orderNo].buyer && buyer) ordersMap[orderNo].buyer = buyer;
          if (!ordersMap[orderNo].style && style) ordersMap[orderNo].style = style;
          if (!ordersMap[orderNo].season && season) ordersMap[orderNo].season = season;
          if (!ordersMap[orderNo].bookingDate && bookingDate) ordersMap[orderNo].bookingDate = bookingDate;
          if (totalOrderQty > 0) ordersMap[orderNo].totalOrderQty = totalOrderQty;
          if (!ordersMap[orderNo].firstShipDate && firstShipDate) ordersMap[orderNo].firstShipDate = firstShipDate;
          if (!ordersMap[orderNo].lastShipDate && lastShipDate) ordersMap[orderNo].lastShipDate = lastShipDate;
          if (!ordersMap[orderNo].fabricNotes && fabricNotes) ordersMap[orderNo].fabricNotes = fabricNotes;
        }

        // Extract item-level attributes
        const color = String(rowMap['color'] || rowMap['colour'] || rowMap['fabriccolor'] || '').trim();
        const fabricConstruction = String(rowMap['fabricconstruction'] || rowMap['construction'] || rowMap['fabrication'] || rowMap['item'] || '').trim();
        const gsm = String(rowMap['gsm'] || '').trim();
        const allocatedQty = parseExcelNumber(rowMap['allocatedqty'] || rowMap['fabricallocatedqty'] || rowMap['reqqty'] || rowMap['orderqty'] || rowMap['totalorderqty']);

        // Knitting fields
        const yarnInhouseDate = parseExcelDate(rowMap['yarninhousedate'] || rowMap['yarninhouse'] || rowMap['yarndate']);
        const knitStartDate = parseExcelDate(rowMap['knitstartdate'] || rowMap['knitstart'] || rowMap['knittingstart']);
        const knitEndDate = parseExcelDate(rowMap['knitenddate'] || rowMap['knitend'] || rowMap['knittingend']);
        const knitQty = parseExcelNumber(rowMap['knitqty'] || rowMap['knittedqty'] || rowMap['knittingqty']);
        const knitStatus = String(rowMap['knitstatus'] || (knitQty >= allocatedQty && allocatedQty > 0 ? 'Completed' : 'In Progress')).trim();

        // Dyeing fields
        const dyeingUnit = String(rowMap['dyeingunit'] || rowMap['dyeunit'] || rowMap['factory'] || '').trim();
        const processName = String(rowMap['processname'] || rowMap['process'] || rowMap['dyeprocess'] || '').trim();
        const dyeStartDate = parseExcelDate(rowMap['dyestartdate'] || rowMap['dyestart'] || rowMap['dyeingstart']);
        const dyeEndDate = parseExcelDate(rowMap['dyeenddate'] || rowMap['dyeend'] || rowMap['dyeingend']);
        const dyeQty = parseExcelNumber(rowMap['dyeqty'] || rowMap['dyedqty'] || rowMap['dyeingqty']);
        const dyeStatus = String(rowMap['dyestatus'] || (dyeQty >= allocatedQty && allocatedQty > 0 ? 'Completed' : 'In Progress')).trim();

        // Delivery fields
        const deliveryTargetDate = parseExcelDate(rowMap['deliverytargetdate'] || rowMap['targetdelivery'] || rowMap['deliverydate'] || rowMap['exfactorydate'] || rowMap['exfactory']);
        const deliveredQty = parseExcelNumber(rowMap['deliveredqty'] || rowMap['delqty'] || rowMap['deliveryqty']);
        const balanceQty = parseExcelNumber(rowMap['balanceqty'] || rowMap['balqty'], Math.max(0, allocatedQty - deliveredQty));
        const failReason = String(rowMap['failreason'] || rowMap['reason'] || rowMap['delayreason'] || '').trim();
        const relatedDept = String(rowMap['relateddept'] || rowMap['department'] || rowMap['dept'] || '').trim();
        const deliveryStatus = String(rowMap['deliverystatus'] || (deliveredQty >= allocatedQty && allocatedQty > 0 ? 'Completed' : 'Pending')).trim();

        // If row contains item specifications or plans, append them
        if (color || fabricConstruction || allocatedQty || knitQty || dyeQty || deliveredQty) {
          // Append to Knitting Plan
          ordersMap[orderNo].knittingPlan.push({
            color,
            fabricConstruction,
            gsm,
            allocatedQty,
            yarnInhouseDate,
            knitStartDate,
            knitEndDate,
            knitQty,
            status: knitStatus
          });

          // Append to Dyeing Plan
          ordersMap[orderNo].dyeingPlan.push({
            color,
            dyeingUnit,
            processName,
            dyeStartDate,
            dyeEndDate,
            dyeQty,
            status: dyeStatus
          });

          // Append to Delivery Plan
          ordersMap[orderNo].deliveryPlan.push({
            color,
            deliveryTargetDate,
            deliveredQty,
            balanceQty,
            failReason,
            relatedDept,
            status: deliveryStatus
          });

          // Append to Fabric Items (Module 1 Unified structure)
          ordersMap[orderNo].fabricItems.push({
            color,
            fabricConstruction,
            gsm,
            allocatedQty,
            yarnInhouseDate,
            knitStartDate,
            knitEndDate,
            knitQty,
            dyeingUnit,
            processName,
            dyeStartDate,
            dyeEndDate,
            dyeQty,
            deliveryTargetDate,
            deliveredQty,
            balanceQty,
            failReason,
            relatedDept
          });
        }
      }
    }

    const orderEntries = Object.values(ordersMap);
    if (orderEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid order rows found in the uploaded file.',
        rowsProcessed: totalRowsProcessed
      });
    }

    // Prepare bulkWrite upsert operations
    const bulkOps = orderEntries.map((order) => ({
      updateOne: {
        filter: { orderNo: order.orderNo },
        update: {
          $set: {
            orderNo: order.orderNo,
            buyer: order.buyer,
            style: order.style,
            season: order.season,
            bookingDate: order.bookingDate,
            totalOrderQty: order.totalOrderQty,
            firstShipDate: order.firstShipDate,
            lastShipDate: order.lastShipDate,
            fabricNotes: order.fabricNotes,
            overallStatus: order.overallStatus,
            status: order.overallStatus,
            generalInfo: order.generalInfo,
            knittingPlan: order.knittingPlan,
            dyeingPlan: order.dyeingPlan,
            deliveryPlan: order.deliveryPlan,
            fabricItems: order.fabricItems
          }
        },
        upsert: true
      }
    }));

    const bulkResult = await UnifiedOrder.bulkWrite(bulkOps, { ordered: false });

    return res.status(200).json({
      success: true,
      message: 'File processed successfully with bulk upsert operations.',
      summary: {
        totalRowsProcessed,
        ordersDetected: orderEntries.length,
        upsertedCount: bulkResult.upsertedCount,
        modifiedCount: bulkResult.modifiedCount,
        matchedCount: bulkResult.matchedCount
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to process file upload.',
      error: error.message
    });
  }
}

module.exports = {
  processExcelUpload
};
